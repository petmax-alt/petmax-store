const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

function makeOrderCode() {
  const stamp = Date.now().toString(36).toUpperCase().slice(-5);
  const rand = Math.floor(Math.random() * 900 + 100);
  return `PM-${stamp}${rand}`;
}

// Fallback values only — real values now live in the settings table (admin-editable).
const DEFAULT_FREE_DELIVERY_THRESHOLD = 3000;
const DEFAULT_SHIPPING_RATES = { tier1: 190, tier2: 260, tier3: 340, extraKg: 110 };

// Mirrors the courier's real tariff slabs: 0.5kg / 1kg / 2kg breakpoints,
// then a flat per-kg rate beyond that. Only the rates themselves are admin-editable.
function calcShippingFee(weightKg, rates) {
  if (weightKg <= 0.5) return rates.tier1;
  if (weightKg <= 1.0) return rates.tier2;
  if (weightKg <= 2.0) return rates.tier3;
  const extraKg = Math.ceil(weightKg - 2.0);
  return rates.tier3 + extraKg * rates.extraKg;
}

// POST /api/orders — place a new order (COD or online)
router.post('/', async (req, res) => {
  const { customer_name, phone, address, city, notes, payment_method, transaction_id, items, coupon_code } = req.body;

  if (!customer_name || !phone || !address || !city) {
    return res.status(400).json({ error: 'Name, phone, address and city are required.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'Your cart is empty.' });
  }
  if (payment_method === 'online' && !transaction_id) {
    return res.status(400).json({ error: 'Please add your transaction ID / reference number for online payment.' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Re-price server-side from the DB so totals can't be tampered with client-side
    let subtotal = 0;
    let totalWeightKg = 0;
    const verifiedItems = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);

      if (item.variant_id) {
        const [variantRows] = await conn.query(
          'SELECT v.*, p.name AS product_name, p.weight AS product_weight FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.product_id = ? FOR UPDATE',
          [item.variant_id, item.id]
        );
        const variant = variantRows[0];
        if (!variant) {
          await conn.rollback();
          return res.status(400).json({ error: `Selected option for product #${item.id} no longer exists.` });
        }
        if (variant.stock < qty) {
          await conn.rollback();
          return res.status(400).json({ error: `Only ${variant.stock} left in stock for "${variant.product_name} — ${variant.label}".` });
        }
        subtotal += variant.price * qty;
        totalWeightKg += Number(variant.product_weight) * qty; // variants share the parent product's weight
        verifiedItems.push({
          id: variant.product_id, variant_id: variant.id,
          name: `${variant.product_name} — ${variant.label}`, price: variant.price, qty,
        });
        continue;
      }

      const [rows] = await conn.query('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.id]);
      const product = rows[0];
      if (!product) {
        await conn.rollback();
        return res.status(400).json({ error: `Product #${item.id} no longer exists.` });
      }
      if (product.stock < qty) {
        await conn.rollback();
        return res.status(400).json({ error: `Only ${product.stock} left in stock for "${product.name}".` });
      }
      subtotal += product.price * qty;
      totalWeightKg += Number(product.weight) * qty;
      verifiedItems.push({ id: product.id, variant_id: null, name: product.name, price: product.price, qty });
    }

    const [settingsRows] = await conn.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('free_delivery_threshold', 'shipping_rate_tier1', 'shipping_rate_tier2', 'shipping_rate_tier3', 'shipping_rate_extra_kg')"
    );
    const settingsMap = {};
    for (const row of settingsRows) settingsMap[row.setting_key] = row.setting_value;
    const freeDeliveryThreshold = Number(settingsMap.free_delivery_threshold ?? DEFAULT_FREE_DELIVERY_THRESHOLD);
    const shippingRates = {
      tier1: Number(settingsMap.shipping_rate_tier1 ?? DEFAULT_SHIPPING_RATES.tier1),
      tier2: Number(settingsMap.shipping_rate_tier2 ?? DEFAULT_SHIPPING_RATES.tier2),
      tier3: Number(settingsMap.shipping_rate_tier3 ?? DEFAULT_SHIPPING_RATES.tier3),
      extraKg: Number(settingsMap.shipping_rate_extra_kg ?? DEFAULT_SHIPPING_RATES.extraKg),
    };

    const delivery_fee = subtotal >= freeDeliveryThreshold ? 0 : calcShippingFee(totalWeightKg, shippingRates);

    // Re-validate the coupon server-side too — never trust a discount amount from the client.
    let discount_amount = 0;
    let appliedCouponCode = null;
    if (coupon_code) {
      const [couponRows] = await conn.query('SELECT * FROM coupons WHERE code = ? FOR UPDATE', [coupon_code.trim().toUpperCase()]);
      const coupon = couponRows[0];
      if (!coupon || !coupon.active) {
        await conn.rollback();
        return res.status(400).json({ error: 'Invalid coupon code' });
      }
      if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) {
        await conn.rollback();
        return res.status(400).json({ error: 'This coupon has expired' });
      }
      if (coupon.max_uses && coupon.used_count >= coupon.max_uses) {
        await conn.rollback();
        return res.status(400).json({ error: 'This coupon has reached its usage limit' });
      }
      if (subtotal < coupon.min_order) {
        await conn.rollback();
        return res.status(400).json({ error: `This coupon needs a minimum order of Rs ${coupon.min_order}` });
      }
      discount_amount = coupon.type === 'percent' ? Math.round(subtotal * coupon.value / 100) : Math.min(coupon.value, subtotal);
      appliedCouponCode = coupon.code;
      await conn.query('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?', [coupon.id]);
    }

    // Government-mandated 4% cash handling fee on Cash on Delivery orders — computed
    // server-side only, never trusted from the client, same as delivery fee and discounts.
    const COD_FEE_RATE = 0.04;
    const collectibleBeforeCodFee = Math.max(0, subtotal + delivery_fee - discount_amount);
    const cod_fee = payment_method === 'cod' ? Math.round(collectibleBeforeCodFee * COD_FEE_RATE) : 0;
    const total = collectibleBeforeCodFee + cod_fee;
    const order_code = makeOrderCode();
    const payment_status = payment_method === 'online' ? 'awaiting_verification' : 'pending';

    const [info] = await conn.query(`
      INSERT INTO orders (order_code, customer_name, phone, address, city, notes, payment_method, payment_status, transaction_id, items, subtotal, delivery_fee, total, customer_id, coupon_code, discount_amount, cod_fee)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [order_code, customer_name, phone, address, city, notes || '', payment_method || 'cod', payment_status, transaction_id || null, JSON.stringify(verifiedItems), subtotal, delivery_fee, total, (req.session && req.session.customerId) || null, appliedCouponCode, discount_amount, cod_fee]);

    for (const it of verifiedItems) {
      if (it.variant_id) {
        await conn.query('UPDATE product_variants SET stock = stock - ? WHERE id = ?', [it.qty, it.variant_id]);
      } else {
        await conn.query('UPDATE products SET stock = stock - ? WHERE id = ?', [it.qty, it.id]);
      }
    }

    await conn.commit();

    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [info.insertId]);
    res.status(201).json({ ...orderRows[0], items: verifiedItems });
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(500).json({ error: 'Something went wrong placing your order.' });
  } finally {
    conn.release();
  }
});

// GET /api/orders/track/:code — order confirmation lookup (public, exact code required)
router.get('/track/:code', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE order_code = ?', [req.params.code]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    res.json({ ...order, items: JSON.parse(order.items) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong looking up your order.' });
  }
});

// ---- Admin-only ----

// GET /api/orders — list all orders
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
    res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading orders.' });
  }
});

// PUT /api/orders/:id/status — update fulfillment/payment status
router.put('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status, payment_status } = req.body;
    const [existingRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Order not found' });

    await pool.query('UPDATE orders SET status = COALESCE(?, status), payment_status = COALESCE(?, payment_status) WHERE id = ?',
      [status || null, payment_status || null, req.params.id]);

    const [updatedRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    const updated = updatedRows[0];
    res.json({ ...updated, items: JSON.parse(updated.items) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the order.' });
  }
});

module.exports = router;
