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
const DEFAULT_DELIVERY_FEE = 200;
const DEFAULT_FREE_DELIVERY_THRESHOLD = 3000;

// POST /api/orders — place a new order (COD or online)
router.post('/', async (req, res) => {
  const { customer_name, phone, address, city, notes, payment_method, transaction_id, items } = req.body;

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
    const verifiedItems = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(item.qty, 10) || 1);

      if (item.variant_id) {
        const [variantRows] = await conn.query(
          'SELECT v.*, p.name AS product_name FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ? AND v.product_id = ? FOR UPDATE',
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
      verifiedItems.push({ id: product.id, variant_id: null, name: product.name, price: product.price, qty });
    }

    const [settingsRows] = await conn.query(
      "SELECT setting_key, setting_value FROM settings WHERE setting_key IN ('delivery_fee', 'free_delivery_threshold')"
    );
    const settingsMap = {};
    for (const row of settingsRows) settingsMap[row.setting_key] = row.setting_value;
    const deliveryFeeAmount = Number(settingsMap.delivery_fee ?? DEFAULT_DELIVERY_FEE);
    const freeDeliveryThreshold = Number(settingsMap.free_delivery_threshold ?? DEFAULT_FREE_DELIVERY_THRESHOLD);

    const delivery_fee = subtotal >= freeDeliveryThreshold ? 0 : deliveryFeeAmount;
    const total = subtotal + delivery_fee;
    const order_code = makeOrderCode();
    const payment_status = payment_method === 'online' ? 'awaiting_verification' : 'pending';

    const [info] = await conn.query(`
      INSERT INTO orders (order_code, customer_name, phone, address, city, notes, payment_method, payment_status, transaction_id, items, subtotal, delivery_fee, total, customer_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [order_code, customer_name, phone, address, city, notes || '', payment_method || 'cod', payment_status, transaction_id || null, JSON.stringify(verifiedItems), subtotal, delivery_fee, total, (req.session && req.session.customerId) || null]);

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
