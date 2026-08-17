const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}

// POST /api/auth/login — username defaults to "admin" so the existing single-field
// login form (just a password box) keeps working for the original bootstrapped account.
router.post('/login', async (req, res) => {
  const { password } = req.body;
  const username = (req.body.username || 'admin').trim().toLowerCase();
  if (!password) return res.status(401).json({ error: 'Incorrect username or password' });
  try {
    const [rows] = await pool.query('SELECT * FROM admins WHERE username = ?', [username]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'Incorrect username or password' });

    const hash = hashPassword(password, admin.password_salt);
    const valid = crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(admin.password_hash, 'hex'));
    if (!valid) return res.status(401).json({ error: 'Incorrect username or password' });

    req.session.isAdmin = true;
    req.session.adminId = admin.id;
    req.session.adminUsername = admin.username;
    res.json({ success: true, username: admin.username, role: admin.role });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong logging you in.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.json({ success: true }));
});

router.get('/status', (req, res) => {
  const isAdmin = !!(req.session && req.session.isAdmin);
  res.json({ isAdmin, username: isAdmin ? req.session.adminUsername : null });
});

// ---- Admin user management ----

// GET /api/auth/admins (admin only)
router.get('/admins', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, username, role, created_at FROM admins ORDER BY created_at ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading admin users.' });
  }
});

// POST /api/auth/admins (admin only) — add a new admin login
router.post('/admins', requireAdmin, async (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const [info] = await pool.query(
      'INSERT INTO admins (username, password_hash, password_salt, role) VALUES (?, ?, ?, ?)',
      [username.trim().toLowerCase(), hash, salt, role === 'owner' ? 'owner' : 'admin']
    );
    res.status(201).json({ id: info.insertId, username: username.trim().toLowerCase(), role: role === 'owner' ? 'owner' : 'admin' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'That username is already taken' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the admin user.' });
  }
});

// PUT /api/auth/admins/:id/password (admin only) — reset another admin's password, or your own
router.put('/admins/:id/password', requireAdmin, async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = hashPassword(password, salt);
    const [info] = await pool.query('UPDATE admins SET password_hash = ?, password_salt = ? WHERE id = ?', [hash, salt, req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Admin user not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong changing the password.' });
  }
});

// DELETE /api/auth/admins/:id (admin only) — can't delete yourself or the last remaining admin
router.delete('/admins/:id', requireAdmin, async (req, res) => {
  try {
    if (Number(req.params.id) === req.session.adminId) {
      return res.status(400).json({ error: "You can't delete your own account while logged in as it." });
    }
    const [countRows] = await pool.query('SELECT COUNT(*) AS c FROM admins');
    if (countRows[0].c <= 1) return res.status(400).json({ error: 'At least one admin account must remain.' });

    const [info] = await pool.query('DELETE FROM admins WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Admin user not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the admin user.' });
  }
});

module.exports = router;
