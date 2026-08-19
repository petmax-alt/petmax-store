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

function slugify(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function stripCoverBlob(row) {
  const { cover_image_data, cover_image_mime, ...rest } = row;
  return { ...rest, has_cover_image: !!cover_image_data };
}

// GET /api/blog — public, published posts only
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM blog_posts WHERE status = 'published' ORDER BY published_at DESC"
    );
    res.json(rows.map(stripCoverBlob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading posts.' });
  }
});

// GET /api/blog/admin — admin only, everything including drafts
router.get('/admin', requireAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blog_posts ORDER BY created_at DESC');
    res.json(rows.map(stripCoverBlob));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading posts.' });
  }
});

// GET /api/blog/image/:id — cover image bytes
router.get('/image/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT cover_image_data, cover_image_mime FROM blog_posts WHERE id = ?', [req.params.id]);
    const row = rows[0];
    if (!row || !row.cover_image_data) return res.status(404).end();
    res.set('Content-Type', row.cover_image_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(row.cover_image_data);
  } catch (err) {
    res.status(500).end();
  }
});

// GET /api/blog/:slug — public, single post (published only — drafts 404 for non-admins)
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blog_posts WHERE slug = ?', [req.params.slug]);
    const post = rows[0];
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.status !== 'published' && !(req.session && req.session.isAdmin)) {
      return res.status(404).json({ error: 'Post not found' });
    }
    res.json(stripCoverBlob(post));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading the post.' });
  }
});

// POST /api/blog (admin only)
router.post('/', requireAdmin, upload.single('cover_image'), async (req, res) => {
  const { title, excerpt, content, status, seo_title, meta_description, meta_robots } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  try {
    const slug = slugify(title);
    const publishedAt = status === 'published' ? new Date() : null;
    const [info] = await pool.query(`
      INSERT INTO blog_posts (title, slug, excerpt, content, status, published_at, cover_image_data, cover_image_mime, seo_title, meta_description, meta_robots)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [title, slug, excerpt || '', content || '', status || 'draft', publishedAt,
        req.file ? req.file.buffer : null, req.file ? req.file.mimetype : null,
        seo_title || null, meta_description || null, meta_robots || 'index,follow']);
    const [created] = await pool.query('SELECT * FROM blog_posts WHERE id = ?', [info.insertId]);
    res.status(201).json(stripCoverBlob(created[0]));
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'A post with a similar title already exists' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong creating the post.' });
  }
});

// PUT /api/blog/:id (admin only)
router.put('/:id', requireAdmin, upload.single('cover_image'), async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM blog_posts WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Post not found' });

    const { title, excerpt, content, status, seo_title, meta_description, meta_robots } = req.body;
    const newStatus = status ?? existing.status;
    // Only stamp published_at the first time a post goes live — don't reset it on every later edit.
    let publishedAt = existing.published_at;
    if (newStatus === 'published' && !existing.published_at) publishedAt = new Date();

    const slug = title ? slugify(title) : existing.slug;
    const cover_image_data = req.file ? req.file.buffer : existing.cover_image_data;
    const cover_image_mime = req.file ? req.file.mimetype : existing.cover_image_mime;

    await pool.query(`
      UPDATE blog_posts SET title=?, slug=?, excerpt=?, content=?, status=?, published_at=?, cover_image_data=?, cover_image_mime=?,
        seo_title=?, meta_description=?, meta_robots=?
      WHERE id=?
    `, [
      title ?? existing.title, slug, excerpt ?? existing.excerpt, content ?? existing.content, newStatus, publishedAt, cover_image_data, cover_image_mime,
      seo_title === '' ? null : (seo_title ?? existing.seo_title),
      meta_description === '' ? null : (meta_description ?? existing.meta_description),
      meta_robots ?? existing.meta_robots,
      req.params.id,
    ]);

    const [updated] = await pool.query('SELECT * FROM blog_posts WHERE id = ?', [req.params.id]);
    res.json(stripCoverBlob(updated[0]));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the post.' });
  }
});

// DELETE /api/blog/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM blog_posts WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Post not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the post.' });
  }
});

module.exports = router;
