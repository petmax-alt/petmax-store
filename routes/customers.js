const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db/database');
const { OAuth2Client } = require('google-auth-library');

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
    if (!customer.password_hash) {
      return res.status(401).json({ error: 'This account signs in with Google. Use the "Sign in with Google" button instead.' });
    }

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

// POST /api/customers/google — verifies the ID token from Google Identity Services,
// then finds or creates the matching customer account.
router.post('/google', async (req, res) => {
  const { credential } = req.body;
  if (!credential) return res.status(400).json({ error: 'Missing Google credential' });
  try {
    const [settingRows] = await pool.query("SELECT setting_value FROM settings WHERE setting_key = 'google_client_id'");
    const clientId = settingRows[0] && settingRows[0].setting_value;
    if (!clientId) return res.status(400).json({ error: 'Google Sign-In is not configured on this store yet' });

    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) return res.status(400).json({ error: 'Could not verify Google account' });

    const [existingByGoogle] = await pool.query('SELECT * FROM customers WHERE google_id = ?', [payload.sub]);
    if (existingByGoogle[0]) {
      req.session.customerId = existingByGoogle[0].id;
      return res.json({ id: existingByGoogle[0].id, name: existingByGoogle[0].name, email: existingByGoogle[0].email, phone: existingByGoogle[0].phone });
    }

    // Someone who already has a password account with this email — just link the Google ID
    // to it instead of creating a duplicate account under the same address.
    const [existingByEmail] = await pool.query('SELECT * FROM customers WHERE email = ?', [payload.email.toLowerCase()]);
    if (existingByEmail[0]) {
      await pool.query('UPDATE customers SET google_id = ? WHERE id = ?', [payload.sub, existingByEmail[0].id]);
      req.session.customerId = existingByEmail[0].id;
      return res.json({ id: existingByEmail[0].id, name: existingByEmail[0].name, email: existingByEmail[0].email, phone: existingByEmail[0].phone });
    }

    const [info] = await pool.query(
      'INSERT INTO customers (name, email, google_id) VALUES (?, ?, ?)',
      [payload.name || payload.email.split('@')[0], payload.email.toLowerCase(), payload.sub]
    );
    req.session.customerId = info.insertId;
    res.status(201).json({ id: info.insertId, name: payload.name || payload.email, email: payload.email.toLowerCase(), phone: null });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Could not verify Google account' });
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
