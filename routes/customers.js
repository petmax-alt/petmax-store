const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db/database');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

function requireCustomer(req, res, next) {
  if (req.session && req.session.customerId) return next();
  return res.status(401).json({ error: 'Please log in to continue' });
}

const { requireAdmin } = require('../middleware/auth');

// GET /api/customers (admin only) — registered accounts, with order stats
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.email, c.phone, c.created_at,
        COUNT(o.id) AS order_count, COALESCE(SUM(o.total), 0) AS total_spent
      FROM customers c
      LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id ORDER BY c.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading customers.' });
  }
});

// POST /api/customers/signup
router.post('/signup', async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const [info] = await pool.query(
      'INSERT INTO customers (name, email, phone, password_hash, password_salt) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), phone || null, hash, salt]
    );
    req.session.customerId = info.insertId;
    res.status(201).json({ id: info.insertId, name: name.trim(), email: email.trim().toLowerCase(), phone: phone || null });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'An account with that email already exists' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating your account.' });
  }
});

// POST /api/customers/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  try {
    const [rows] = await pool.query('SELECT * FROM customers WHERE email = ?', [email.trim().toLowerCase()]);
    const customer = rows[0];
    if (!customer) return res.status(401).json({ error: 'Incorrect email or password' });

    const hash = hashPassword(password, customer.password_salt);
    const valid = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(customer.password_hash, 'hex'));
    if (!valid) return res.status(401).json({ error: 'Incorrect email or password' });

    req.session.customerId = customer.id;
    res.json({ id: customer.id, name: customer.name, email: customer.email, phone: customer.phone });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging you in.' });
  }
});

// POST /api/customers/logout
router.post('/logout', (req, res) => {
  delete req.session.customerId;
  res.json({ success: true });
});

// GET /api/customers/me
router.get('/me', async (req, res) => {
  if (!req.session || !req.session.customerId) return res.json(null);
  try {
    const [rows] = await pool.query('SELECT id, name, email, phone FROM customers WHERE id = ?', [req.session.customerId]);
    res.json(rows[0] || null);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading your account.' });
  }
});

// GET /api/customers/me/orders — order history for the logged-in customer
router.get('/me/orders', requireCustomer, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC', [req.session.customerId]);
    res.json(rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading your orders.' });
  }
});

module.exports = { router, requireCustomer };
