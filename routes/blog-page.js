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

router.get('/blog/:slug', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM blog_posts WHERE slug = ?', [req.params.slug]);
    const post = rows[0];
    if (!post || (post.status !== 'published' && !(req.session && req.session.isAdmin))) return next();

    const settings = await getSettings();
    const siteUrl = (settings.site_url || 'https://petmax.pk').replace(/\/$/, '');
    const siteName = settings.site_name || 'Pet Max';
    const pageUrl = `${siteUrl}/blog/${post.slug}`;

    const seoTitle = post.seo_title || `${post.title} | ${siteName} Blog`;
    const metaDescription = post.meta_description || post.excerpt || stripHtml(post.content).slice(0, 155);
    const robots = post.meta_robots || 'index,follow';
    const ogImage = post.cover_image_data ? `${siteUrl}/api/blog/image/${post.id}` : `${siteUrl}/images/logo.png`;

    const articleSchema = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: metaDescription,
      image: [ogImage],
      datePublished: post.published_at,
      dateModified: post.updated_at,
      author: { '@type': 'Organization', name: siteName },
      publisher: { '@type': 'Organization', name: siteName, logo: { '@type': 'ImageObject', url: `${siteUrl}/images/logo.png` } },
      mainEntityOfPage: { '@type': 'WebPage', '@id': pageUrl },
    };

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(metaDescription)}">
<meta name="robots" content="${esc(robots)}">
<link rel="canonical" href="${esc(pageUrl)}">
<link rel="icon" href="/images/logo.png">

<meta property="og:type" content="article">
<meta property="og:title" content="${esc(seoTitle)}">
<meta property="og:description" content="${esc(metaDescription)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:site_name" content="${esc(siteName)}">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(seoTitle)}">
<meta name="twitter:description" content="${esc(metaDescription)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<script type="application/ld+json">${JSON.stringify(articleSchema)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css">
${settings.google_analytics_id ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(settings.google_analytics_id)}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${esc(settings.google_analytics_id)}');</script>` : ''}
${settings.google_site_verification ? `<meta name="google-site-verification" content="${esc(settings.google_site_verification)}">` : ''}
${settings.custom_head_scripts || ''}
</head>
<body>

<header class="site-header">
  <div class="header-inner">
    <a href="/" class="brand">
      <img src="/images/logo.png" alt="Pet Max logo">
      <span class="brand-name">PET MAX<span>Tech made simple, tails made happy</span></span>
    </a>
    <nav class="main-nav">
      <a href="/#shop">Shop</a>
      <a href="/#categories">Categories</a>
      <a href="/#about">Why Pet Max</a>
      <a href="/blog" class="active">Blog</a>
    </nav>
    <div class="header-actions">
      <button class="icon-btn" onclick="location.href='/'" aria-label="Back to shop">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      </button>
    </div>
  </div>
</header>

<main class="blog-post-wrap">
  <a href="/blog" class="blog-back-link">← Back to blog</a>
  ${post.cover_image_data ? `<div class="blog-post-cover"><img src="/api/blog/image/${post.id}" alt="${esc(post.title)}"></div>` : ''}
  <span class="blog-card-date">${new Date(post.published_at || post.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
  <h1>${esc(post.title)}</h1>
  <div class="blog-post-content">${post.content || ''}</div>
</main>

<footer class="site-footer">
  <div class="footer-grid">
    <div class="footer-brand">
      <img src="/images/logo.png" alt="Pet Max">
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
    res.status(500).send('Something went wrong loading this post.');
  }
});

module.exports = router;
