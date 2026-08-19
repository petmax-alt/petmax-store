const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/redirects (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM redirects ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading redirects.' });
  }
});

// POST /api/redirects (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { from_path, to_path, status_code } = req.body;
  if (!from_path || !to_path) return res.status(400).json({ error: 'Both the old and new path are required' });
  if (!from_path.startsWith('/') || !to_path.startsWith('/')) {
    return res.status(400).json({ error: "Paths must start with / (e.g. /old-page, not old-page)" });
  }
  try {
    const [info] = await pool.query(
      'INSERT INTO redirects (from_path, to_path, status_code) VALUES (?, ?, ?)',
      [from_path.trim(), to_path.trim(), Number(status_code) === 302 ? 302 : 301]
    );
    const [created] = await pool.query('SELECT * FROM redirects WHERE id = ?', [info.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'A redirect from that path already exists' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong adding the redirect.' });
  }
});

// DELETE /api/redirects/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM redirects WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Redirect not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the redirect.' });
  }
});

module.exports = router;
