const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// POST /api/contact — public submission
router.post('/', async (req, res) => {
  const { name, email, phone, message } = req.body;
  if (!name || !message) return res.status(400).json({ error: 'Name and message are required' });
  try {
    await pool.query(
      'INSERT INTO contact_messages (name, email, phone, message) VALUES (?, ?, ?, ?)',
      [name.trim(), email || null, phone || null, message.trim()]
    );
    res.status(201).json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong sending your message.' });
  }
});

// GET /api/contact (admin only)
router.get('/', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading messages.' });
  }
});

// PUT /api/contact/:id (admin only) — mark read/unread
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const [info] = await pool.query('UPDATE contact_messages SET status = ? WHERE id = ?', [status || 'read', req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Message not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the message.' });
  }
});

// DELETE /api/contact/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Message not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the message.' });
  }
});

module.exports = router;
