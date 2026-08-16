const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// GET /api/categories — includes a live product count per category
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT c.id, c.name, c.slug,
        (SELECT COUNT(*) FROM products p WHERE p.category = c.name) AS product_count
      FROM categories c ORDER BY c.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading categories.' });
  }
});

// POST /api/categories (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required' });
  try {
    const [info] = await pool.query('INSERT INTO categories (name, slug) VALUES (?, ?)', [name.trim(), slugify(name)]);
    res.status(201).json({ id: info.insertId, name: name.trim(), slug: slugify(name), product_count: 0 });
  } catch (err) {
    res.status(400).json({ error: 'A category with that name already exists' });
  }
});

// DELETE /api/categories/:id (admin only) — blocked if products still use it
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [catRows] = await pool.query('SELECT * FROM categories WHERE id = ?', [req.params.id]);
    const cat = catRows[0];
    if (!cat) return res.status(404).json({ error: 'Category not found' });

    const [inUse] = await pool.query('SELECT COUNT(*) AS c FROM products WHERE category = ?', [cat.name]);
    if (inUse[0].c > 0) {
      return res.status(400).json({ error: `${inUse[0].c} product(s) still use this category. Move them first.` });
    }

    await pool.query('DELETE FROM categories WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the category.' });
  }
});

module.exports = router;
