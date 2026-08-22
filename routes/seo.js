const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');

async function getSetting(key, fallback) {
  const [rows] = await pool.query('SELECT setting_value FROM settings WHERE setting_key = ?', [key]);
  return (rows[0] && rows[0].setting_value) || fallback;
}

// GET /sitemap.xml — auto-generated from products, categories, and published blog posts
router.get('/sitemap.xml', async (req, res) => {
  try {
    const siteUrl = (await getSetting('site_url', 'https://petmax.pk')).replace(/\/$/, '');

    const [products] = await pool.query('SELECT slug, created_at FROM products');
    const [posts] = await pool.query("SELECT slug, updated_at FROM blog_posts WHERE status = 'published'");
    const [pages] = await pool.query("SELECT slug, updated_at FROM pages WHERE status = 'published'");
    const [categories] = await pool.query('SELECT slug FROM categories');

    const urls = [
      { loc: siteUrl, priority: '1.0' },
      { loc: `${siteUrl}/blog`, priority: '0.7' },
      { loc: `${siteUrl}/contact`, priority: '0.5' },
      ...products.map(p => ({ loc: `${siteUrl}/product/${p.slug}`, lastmod: p.created_at, priority: '0.8' })),
      ...categories.map(c => ({ loc: `${siteUrl}/category/${c.slug}`, priority: '0.7' })),
      ...posts.map(p => ({ loc: `${siteUrl}/blog/${p.slug}`, lastmod: p.updated_at, priority: '0.6' })),
      ...pages.map(p => ({ loc: `${siteUrl}/${p.slug}`, lastmod: p.updated_at, priority: '0.4' })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    ${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString().slice(0, 10)}</lastmod>` : ''}
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).send('Could not generate sitemap');
  }
});

// GET /robots.txt — editable via Store Settings, falls back to a sane default
router.get('/robots.txt', async (req, res) => {
  try {
    const content = await getSetting('robots_txt', 'User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api\n');
    res.set('Content-Type', 'text/plain');
    res.send(content);
  } catch (err) {
    res.set('Content-Type', 'text/plain');
    res.send('User-agent: *\nAllow: /\n');
  }
});

module.exports = router;
