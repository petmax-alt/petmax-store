const express = require('express');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Images go straight into MySQL — no disk writes, so nothing gets lost on redeploy.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 }, // 4MB per image is plenty for a product photo
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files are allowed'));
    }
    cb(null, true);
  },
});

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Never send raw image bytes in list/detail JSON — that would bloat every response.
// Instead we send a boolean flag; the frontend fetches the real image from /image/:id.
function stripImageBlob(row) {
  const { image_data, ...rest } = row;
  return { ...rest, has_image: !!image_data };
}

// GET /api/products  ?category=&search=&sort=
router.get('/', async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    let sql = 'SELECT * FROM products WHERE 1=1';
    const params = [];

    if (category && category !== 'All') {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (search) {
      sql += ' AND (name LIKE ? OR description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const sortMap = {
      'price-asc': 'price ASC',
      'price-desc': 'price DESC',
      'rating': 'rating DESC',
      'newest': 'created_at DESC',
    };
    sql += ` ORDER BY ${sortMap[sort] || 'created_at DESC'}`;

    const [rows] = await pool.query(sql, params);
    res.json(rows.map(stripImageBlob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading products.' });
  }
});

// GET /api/products/categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
    res.json(rows.map(r => r.category));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading categories.' });
  }
});

// GET /api/products/image/:id — serves the actual photo bytes from MySQL
router.get('/image/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_data, image_mime FROM products WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row || !row.image_data) return res.status(404).end();
    res.set('Content-Type', row.image_mime || 'image/jpeg');
    res.set('Cache-Control', 'public, max-age=86400'); // images rarely change once uploaded
    res.send(row.image_data);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// GET /api/products/:slug
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE slug = ?', [req.params.slug]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(stripImageBlob(rows[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading the product.' });
  }
});

// POST /api/products  (admin only) — multipart/form-data, optional "image" file field
router.post('/', requireAdmin, upload.single('image'), async (req, res) => {
  const { name, category, price, compare_price, stock, description, icon, accent, badge } = req.body;
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'name, category and price are required' });
  }
  const slug = slugify(name);
  const image_data = req.file ? req.file.buffer : null;
  const image_mime = req.file ? req.file.mimetype : null;
  try {
    const [info] = await pool.query(`
      INSERT INTO products (name, slug, category, price, compare_price, stock, description, icon, accent, badge, image_data, image_mime)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, slug, category, price, compare_price || null, stock || 0, description || '', icon || 'food', accent || 'orange', badge || null, image_data, image_mime]);
    const [created] = await pool.query('SELECT * FROM products WHERE id = ?', [info.insertId]);
    res.status(201).json(stripImageBlob(created[0]));
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'A product with a similar name already exists' });
  }
});

// PUT /api/products/:id  (admin only) — multipart/form-data, optional "image" file field
router.put('/:id', requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const { name, category, price, compare_price, stock, description, icon, accent, badge, remove_image } = req.body;
    const updated = {
      name: name ?? existing.name,
      category: category ?? existing.category,
      price: price ?? existing.price,
      compare_price: compare_price === '' ? null : (compare_price ?? existing.compare_price),
      stock: stock ?? existing.stock,
      description: description ?? existing.description,
      icon: icon ?? existing.icon,
      accent: accent ?? existing.accent,
      badge: badge === '' ? null : (badge ?? existing.badge),
    };
    const slug = name ? slugify(name) : existing.slug;

    // Only touch the image if a new file was uploaded, or the admin explicitly asked to remove it.
    let image_data = existing.image_data;
    let image_mime = existing.image_mime;
    if (req.file) {
      image_data = req.file.buffer;
      image_mime = req.file.mimetype;
    } else if (remove_image === 'true') {
      image_data = null;
      image_mime = null;
    }

    await pool.query(`
      UPDATE products SET name=?, slug=?, category=?, price=?, compare_price=?, stock=?, description=?, icon=?, accent=?, badge=?, image_data=?, image_mime=?
      WHERE id=?
    `, [updated.name, slug, updated.category, updated.price, updated.compare_price, updated.stock, updated.description, updated.icon, updated.accent, updated.badge, image_data, image_mime, req.params.id]);

    const [result] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(stripImageBlob(result[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the product.' });
  }
});

// PATCH /api/products/:id/stock (admin only) — quick +/- from the Inventory view
router.patch('/:id/stock', requireAdmin, async (req, res) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== 'number') return res.status(400).json({ error: 'delta must be a number' });

    const [existingRows] = await pool.query('SELECT stock FROM products WHERE id = ?', [req.params.id]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Product not found' });

    const newStock = Math.max(0, existingRows[0].stock + delta);
    await pool.query('UPDATE products SET stock = ? WHERE id = ?', [newStock, req.params.id]);
    res.json({ id: Number(req.params.id), stock: newStock });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong adjusting stock.' });
  }
});

// DELETE /api/products/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the product.' });
  }
});

module.exports = router;
