const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed')),
});

// Known slots this store supports today. Keeps /:key from being an arbitrary write target.
const VALID_KEYS = ['hero'];

// GET /api/site-images/:key — falls back to the shipped logo file if nothing's been uploaded yet,
// so the homepage never shows a broken image before the admin sets a custom one.
router.get('/:key', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_data, image_mime FROM site_images WHERE image_key = ?', [req.params.key]);
    if (rows[0]) {
      res.set('Content-Type', rows[0].image_mime);
      res.set('Cache-Control', 'public, max-age=3600');
      return res.send(rows[0].image_data);
    }
    const fallbackPath = path.join(__dirname, '..', 'public', 'images', 'logo.png');
    if (fs.existsSync(fallbackPath)) {
      res.set('Content-Type', 'image/png');
      return res.sendFile(fallbackPath);
    }
    res.status(404).end();
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// POST /api/site-images/:key (admin only)
router.post('/:key', requireAdmin, upload.single('image'), async (req, res) => {
  if (!VALID_KEYS.includes(req.params.key)) return res.status(400).json({ error: 'Unknown image slot' });
  if (!req.file) return res.status(400).json({ error: 'An image file is required' });
  try {
    await pool.query(
      'INSERT INTO site_images (image_key, image_data, image_mime) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE image_data = ?, image_mime = ?',
      [req.params.key, req.file.buffer, req.file.mimetype, req.file.buffer, req.file.mimetype]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong saving the image.' });
  }
});

// DELETE /api/site-images/:key (admin only) — reverts to the default fallback
router.delete('/:key', requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM site_images WHERE image_key = ?', [req.params.key]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong resetting the image.' });
  }
});

module.exports = router;
