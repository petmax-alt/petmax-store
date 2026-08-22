const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');

async function getSettings() {
  const [rows] = await pool.query('SELECT setting_key, setting_value FROM settings');
  const s = {};
  for (const row of rows) s[row.setting_key] = row.setting_value;
  return s;
}
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

router.get('/category/:slug', async (req, res, next) => {
  try {
    const [catRows] = await pool.query('SELECT * FROM categories WHERE slug = ?', [req.params.slug]);
    const category = catRows[0];
    if (!category) return next();

    const [products] = await pool.query('SELECT * FROM products WHERE category = ? ORDER BY created_at DESC', [category.name]);
    const settings = await getSettings();
    const siteUrl = (settings.site_url || 'https://petmax.pk').replace(/\/$/, '');
    const siteName = settings.site_name || 'Pet Max';
    const pageUrl = `${siteUrl}/category/${category.slug}`;
    const seoTitle = category.seo_title || `${category.name} | ${siteName}`;
    const metaDescription = category.meta_description || `Shop ${category.name.toLowerCase()} at ${siteName} — delivered across Pakistan with Cash on Delivery.`;

    // One query for cover images, avoiding N+1
    const productIds = products.map(p => p.id);
    let imageMap = new Map();
    if (productIds.length) {
      const [imgRows] = await pool.query(
        'SELECT product_id, MIN(id) AS cover_id FROM product_images WHERE product_id IN (?) GROUP BY product_id',
        [productIds]
      );
      imageMap = new Map(imgRows.map(r => [r.product_id, true]));
    }

    const breadcrumbSchema = {
      '@context': 'https://schema.org', '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: category.name, item: pageUrl },
      ],
    };
    const itemListSchema = {
      '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: products.map((p, i) => ({
        '@type': 'ListItem', position: i + 1, url: `${siteUrl}/product/${p.slug}`,
      })),
    };

    const cardsHtml = products.map(p => `
      <a href="/product/${p.slug}" class="cat-product-card">
        <div class="cat-product-media">${imageMap.has(p.id) ? `<img src="/api/products/image/${p.id}" alt="${esc(p.name)}" loading="lazy">` : '<div class="cat-product-placeholder">🐾</div>'}</div>
        <div class="cat-product-body">
          <h2>${esc(p.name)}</h2>
          <span class="price">Rs ${Number(p.price).toLocaleString('en-PK')}</span>
        </div>
      </a>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(metaDescription)}">
<link rel="canonical" href="${esc(pageUrl)}">
<link rel="icon" type="image/x-icon" href="/images/favicon.ico">
<link rel="manifest" href="/manifest.json">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(metaDescription)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:site_name" content="${esc(siteName)}">
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
<script type="application/ld+json">${JSON.stringify(itemListSchema)}</script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v=20260822b">
${settings.google_analytics_id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(settings.google_analytics_id)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(settings.google_analytics_id)}');</script>` : ''}
${settings.custom_head_scripts || ''}
</head>
<body>

<header class="site-header">
  <div class="header-inner">
    <a href="/" class="brand">
      <img src="/images/logo.png" alt="${esc(siteName)} logo">
      <span class="brand-name">PET MAX<span>Tech made simple, tails made happy</span></span>
    </a>
    <nav class="main-nav">
      <a href="/#shop">Shop</a>
      <a href="/#categories">Categories</a>
      <a href="/blog">Blog</a>
      <a href="/contact">Contact</a>
    </nav>
    <div class="header-actions">
      <button class="icon-btn" onclick="location.href='/'" aria-label="Back to shop">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      </button>
    </div>
  </div>
</header>

<nav class="pp-breadcrumb container">
  <a href="/">Home</a> / <span>${esc(category.name)}</span>
</nav>

<main class="cat-page-wrap container">
  <h1>${esc(category.name)}</h1>
  ${products.length ? `<div class="cat-product-grid">${cardsHtml}</div>` : `<p class="cat-empty">No products in this category yet — check back soon.</p>`}
</main>

<footer class="site-footer">
  <div class="footer-grid">
    <div class="footer-brand">
      <img src="/images/logo.png" alt="${esc(siteName)}">
      <p>A Pakistan-based pet supplies store for cat food, treats, litter, grooming and toys.</p>
    </div>
  </div>
  <div class="footer-bottom">
    <span>© <span id="year"></span> ${esc(siteName)}. Made for cats, run from Lahore.</span>
  </div>
</footer>

<script>document.getElementById('year').textContent = new Date().getFullYear();</script>
${settings.custom_footer_scripts || ''}
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this category.');
  }
});

module.exports = router;
