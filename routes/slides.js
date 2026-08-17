const express = require('express');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => file.mimetype.startsWith('image/') ? cb(null, true) : cb(new Error('Only image files are allowed')),
});

function stripBlob(row) {
  const { image_data, image_mime, ...rest } = row;
  return rest;
}

// GET /api/slides — public, active slides only, in order
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM homepage_slides WHERE active = 1 ORDER BY sort_order ASC, id ASC');
    res.json(rows.map(stripBlob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading slides.' });
  }
});

// GET /api/slides/admin — admin only, everything including inactive
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM homepage_slides ORDER BY sort_order ASC, id ASC');
    res.json(rows.map(stripBlob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading slides.' });
  }
});

// GET /api/slides/image/:id
router.get('/image/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_data, image_mime FROM homepage_slides WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row) return res.status(404).end();
    res.set('Content-Type', row.image_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(row.image_data);
  } catch (err) {
    res.status(500).end();
  }
});

// POST /api/slides (admin only)
router.post('/', requireAdmin, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'An image is required for each slide' });
  try {
    const { heading, subheading, link_url } = req.body;
    const [maxRow] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM homepage_slides');
    const [info] = await pool.query(
      'INSERT INTO homepage_slides (image_data, image_mime, heading, subheading, link_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)',
      [req.file.buffer, req.file.mimetype, heading || '', subheading || '', link_url || '', maxRow[0].m + 1]
    );
    const [created] = await pool.query('SELECT * FROM homepage_slides WHERE id = ?', [info.insertId]);
    res.status(201).json(stripBlob(created[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong adding the slide.' });
  }
});

// PUT /api/slides/:id (admin only)
router.put('/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM homepage_slides WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Slide not found' });

    const { heading, subheading, link_url, active } = req.body;
    const image_data = req.file ? req.file.buffer : existing.image_data;
    const image_mime = req.file ? req.file.mimetype : existing.image_mime;

    await pool.query(
      'UPDATE homepage_slides SET heading=?, subheading=?, link_url=?, active=?, image_data=?, image_mime=? WHERE id=?',
      [heading ?? existing.heading, subheading ?? existing.subheading, link_url ?? existing.link_url,
       active === undefined ? existing.active : (active === 'true' || active === true ? 1 : 0),
       image_data, image_mime, req.params.id]
    );
    const [updated] = await pool.query('SELECT * FROM homepage_slides WHERE id = ?', [req.params.id]);
    res.json(stripBlob(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the slide.' });
  }
});

// PUT /api/slides/order/all (admin only) — body: { order: [id, id, ...] }
router.put('/order/all', requireAdmin, async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
    for (let i = 0; i < order.length; i++) {
      await pool.query('UPDATE homepage_slides SET sort_order = ? WHERE id = ?', [i, order[i]]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong reordering slides.' });
  }
});

// DELETE /api/slides/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM homepage_slides WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Slide not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the slide.' });
  }
});

module.exports = router;
