const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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
    res.json(rows);
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

// GET /api/products/:slug
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE slug = ?', [req.params.slug]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading the product.' });
  }
});

// POST /api/products  (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { name, category, price, compare_price, stock, description, icon, accent, badge } = req.body;
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'name, category and price are required' });
  }
  const slug = slugify(name);
  try {
    const [info] = await pool.query(`
      INSERT INTO products (name, slug, category, price, compare_price, stock, description, icon, accent, badge)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [name, slug, category, price, compare_price || null, stock || 0, description || '', icon || 'food', accent || 'orange', badge || null]);
    const [created] = await pool.query('SELECT * FROM products WHERE id = ?', [info.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    res.status(400).json({ error: 'A product with a similar name already exists' });
  }
});

// PUT /api/products/:id  (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const { name, category, price, compare_price, stock, description, icon, accent, badge } = req.body;
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

    await pool.query(`
      UPDATE products SET name=?, slug=?, category=?, price=?, compare_price=?, stock=?, description=?, icon=?, accent=?, badge=?
      WHERE id=?
    `, [updated.name, slug, updated.category, updated.price, updated.compare_price, updated.stock, updated.description, updated.icon, updated.accent, updated.badge, req.params.id]);

    const [result] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(result[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the product.' });
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
