const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/settings — public, the storefront needs these to render checkout correctly
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    for (const row of rows) settings[row.setting_key] = row.setting_value;
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading settings.' });
  }
});

// PUT /api/settings (admin only) — accepts a flat { key: value } object, upserts each
router.put('/', requireAdmin, async (req, res) => {
  try {
    const entries = Object.entries(req.body || {});
    for (const [key, value] of entries) {
      await pool.query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, String(value), String(value)]
      );
    }
    const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
    const settings = {};
    for (const row of rows) settings[row.setting_key] = row.setting_value;
    res.json(settings);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong saving settings.' });
  }
});

module.exports = router;
