const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/coupons (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM coupons ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading coupons.' });
  }
});

// POST /api/coupons (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { code, type, value, min_order, max_uses, expires_at } = req.body;
  if (!code || !value) return res.status(400).json({ error: 'Code and value are required' });
  try {
    const [info] = await pool.query(`
      INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [code.trim().toUpperCase(), type === 'fixed' ? 'fixed' : 'percent', value, min_order || 0, max_uses || null, expires_at || null]);
    const [created] = await pool.query('SELECT * FROM coupons WHERE id = ?', [info.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'That coupon code already exists' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the coupon.' });
  }
});

// PUT /api/coupons/:id (admin only) — mainly used to toggle active on/off
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Coupon not found' });
    const { active } = req.body;
    await pool.query('UPDATE coupons SET active = ? WHERE id = ?', [active ? 1 : 0, req.params.id]);
    const [updated] = await pool.query('SELECT * FROM coupons WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the coupon.' });
  }
});

// DELETE /api/coupons/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM coupons WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the coupon.' });
  }
});

// POST /api/coupons/validate — public, used at checkout to preview a discount before placing the order
router.post('/validate', async (req, res) => {
  try {
    const { code, subtotal } = req.body;
    if (!code) return res.status(400).json({ error: 'Enter a coupon code' });
    const [rows] = await pool.query('SELECT * FROM coupons WHERE code = ?', [code.trim().toUpperCase()]);
    const coupon = rows[0];
    if (!coupon || !coupon.active) return res.status(400).json({ error: 'Invalid coupon code' });
    if (coupon.expires_at && new Date(coupon.expires_at) < new Date()) return res.status(400).json({ error: 'This coupon has expired' });
    if (coupon.max_uses && coupon.used_count >= coupon.max_uses) return res.status(400).json({ error: 'This coupon has reached its usage limit' });
    if (subtotal < coupon.min_order) return res.status(400).json({ error: `This coupon needs a minimum order of Rs ${coupon.min_order}` });

    const discount = coupon.type === 'percent' ? Math.round(subtotal * coupon.value / 100) : Math.min(coupon.value, subtotal);
    res.json({ code: coupon.code, type: coupon.type, value: coupon.value, discount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong checking that coupon.' });
  }
});

module.exports = router;
