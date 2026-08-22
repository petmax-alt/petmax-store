const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Slugs that must never be claimed by an admin-created page, since real routes
// already own these paths — this is checked on both create and rename.
const RESERVED_SLUGS = [
  'admin', 'blog', 'product', 'category', 'api', 'images', 'css', 'js',
  'sitemap.xml', 'robots.txt', 'manifest.json', 'contact', 'favicon.ico',
];

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// GET /api/pages/admin — admin only, everything including drafts
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pages ORDER BY title ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading pages.' });
  }
});

// GET /api/pages/:slug — public, published only (drafts visible to admins for preview)
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pages WHERE slug = ?', [req.params.slug]);
    const page = rows[0];
    if (!page) return res.status(404).json({ error: 'Page not found' });
    if (page.status !== 'published' && !(req.session && req.session.isAdmin)) {
      return res.status(404).json({ error: 'Page not found' });
    }
    res.json(page);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading the page.' });
  }
});

// POST /api/pages (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const { title, content, status, seo_title, meta_description, meta_robots } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  const slug = slugify(title);
  if (RESERVED_SLUGS.includes(slug)) {
    return res.status(400).json({ error: `"${title}" isn't allowed as a page title — it conflicts with a built-in page.` });
  }
  try {
    const [info] = await pool.query(
      'INSERT INTO pages (title, slug, content, status, seo_title, meta_description, meta_robots) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [title, slug, content || '', status || 'draft', seo_title || null, meta_description || null, meta_robots || 'index,follow']
    );
    const [created] = await pool.query('SELECT * FROM pages WHERE id = ?', [info.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'A page with a similar title already exists' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the page.' });
  }
});

// PUT /api/pages/:id (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM pages WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Page not found' });

    const { title, content, status, seo_title, meta_description, meta_robots } = req.body;
    const slug = title ? slugify(title) : existing.slug;
    if (RESERVED_SLUGS.includes(slug) && slug !== existing.slug) {
      return res.status(400).json({ error: `"${title}" isn't allowed as a page title — it conflicts with a built-in page.` });
    }

    await pool.query(
      'UPDATE pages SET title=?, slug=?, content=?, status=?, seo_title=?, meta_description=?, meta_robots=? WHERE id=?',
      [
        title ?? existing.title, slug, content ?? existing.content, status ?? existing.status,
        seo_title === '' ? null : (seo_title ?? existing.seo_title),
        meta_description === '' ? null : (meta_description ?? existing.meta_description),
        meta_robots ?? existing.meta_robots,
        req.params.id,
      ]
    );
    const [updated] = await pool.query('SELECT * FROM pages WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the page.' });
  }
});

// DELETE /api/pages/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM pages WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Page not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the page.' });
  }
});

module.exports = router;
