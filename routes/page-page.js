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
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

// This must be registered AFTER every other specific route (product, blog, category,
// admin, etc.) since it matches a single free-form top-level path segment.
router.get('/:slug', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM pages WHERE slug = ?', [req.params.slug]);
    const page = rows[0];
    if (!page || (page.status !== 'published' && !(req.session && req.session.isAdmin))) return next();

    const settings = await getSettings();
    const siteUrl = (settings.site_url || 'https://petmax.pk').replace(/\/$/, '');
    const siteName = settings.site_name || 'Pet Max';
    const pageUrl = `${siteUrl}/${page.slug}`;
    const seoTitle = page.seo_title || `${page.title} | ${siteName}`;
    const metaDescription = page.meta_description || stripHtml(page.content).slice(0, 155);

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(metaDescription)}">
<meta name="robots" content="${esc(page.meta_robots || 'index,follow')}">
<link rel="canonical" href="${esc(pageUrl)}">
<link rel="icon" type="image/x-icon" href="/images/favicon.ico">
<link rel="manifest" href="/manifest.json">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(metaDescription)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:site_name" content="${esc(siteName)}">
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

<main class="static-page-wrap">
  <h1>${esc(page.title)}</h1>
  <div class="static-page-content">${page.content || ''}</div>
</main>

<footer class="site-footer">
  <div class="footer-grid">
    <div class="footer-brand">
      <img src="/images/logo.png" alt="${esc(siteName)}">
      <p>A Pakistan-based pet supplies store for cat food, treats, litter, grooming and toys.</p>
    </div>
    <div class="footer-col">
      <h4>Company</h4>
      <ul>
        <li><a href="/about-us">About Us</a></li>
        <li><a href="/contact">Contact</a></li>
        <li><a href="/privacy-policy">Privacy Policy</a></li>
        <li><a href="/terms-and-conditions">Terms &amp; Conditions</a></li>
        <li><a href="/shipping-policy">Shipping Policy</a></li>
        <li><a href="/return-refund-policy">Returns &amp; Refunds</a></li>
      </ul>
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
    res.status(500).send('Something went wrong loading this page.');
  }
});

module.exports = router;
