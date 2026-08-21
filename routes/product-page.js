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

// Strips HTML tags for use inside meta description / JSON-LD text fields
function stripHtml(html) {
  return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

router.get('/product/:slug', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE slug = ?', [req.params.slug]);
    const p = rows[0];
    if (!p) return next(); // fall through to 404 handling

    const [images] = await pool.query('SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [p.id]);
    const [variants] = await pool.query('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC, id ASC', [p.id]);
    const [reviews] = await pool.query('SELECT * FROM product_reviews WHERE product_id = ? ORDER BY review_date DESC', [p.id]);
    const reviewCount = reviews.length;
    const avgRating = reviewCount > 0 ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviewCount) * 10) / 10 : 0;
    p.rating = avgRating; // overwrite the old static seed value with real data everywhere below
    p.reviews = reviewCount;
    const settings = await getSettings();

    const siteUrl = (settings.site_url || 'https://petmax.pk').replace(/\/$/, '');
    const siteName = settings.site_name || 'Pet Max';
    const pageUrl = `${siteUrl}/product/${p.slug}`;

    const seoTitle = p.seo_title || `${p.name} | ${siteName}`;
    const metaDescription = p.meta_description || stripHtml(p.description).slice(0, 155) || settings.default_meta_description || '';
    const canonical = p.canonical_url || pageUrl;
    const robots = p.meta_robots || 'index,follow';
    const ogTitle = p.og_title || seoTitle;
    const ogDescription = p.og_description || metaDescription;
    const ogImage = images[0] ? `${siteUrl}/api/products/image/${p.id}` : `${siteUrl}/images/logo.png`;

    const hasVariants = variants.length > 0;
    const minPrice = hasVariants ? Math.min(...variants.map(v => v.price)) : p.price;
    const maxPrice = hasVariants ? Math.max(...variants.map(v => v.price)) : p.price;
    const totalStock = hasVariants ? variants.reduce((s, v) => s + v.stock, 0) : p.stock;
    const availability = totalStock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock';

    const productSchema = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: p.name,
      description: stripHtml(p.description) || metaDescription,
      sku: p.sku || undefined,
      mpn: p.mpn || undefined,
      gtin: p.gtin || undefined,
      brand: { '@type': 'Brand', name: p.brand || 'Pet Max' },
      image: images.map(img => `${siteUrl}/api/products/images/${img.id}`),
      category: p.category,
      aggregateRating: p.reviews > 0 ? { '@type': 'AggregateRating', ratingValue: p.rating, reviewCount: p.reviews } : undefined,
      review: reviews.length ? reviews.slice(0, 20).map(r => ({
        '@type': 'Review',
        author: { '@type': 'Person', name: r.author_name },
        datePublished: r.review_date,
        reviewBody: r.review_text || undefined,
        reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
      })) : undefined,
      offers: hasVariants ? {
        '@type': 'AggregateOffer', priceCurrency: settings.currency_symbol === 'Rs' ? 'PKR' : (settings.currency_symbol || 'PKR'),
        lowPrice: minPrice, highPrice: maxPrice, offerCount: variants.length, availability,
      } : {
        '@type': 'Offer', priceCurrency: settings.currency_symbol === 'Rs' ? 'PKR' : (settings.currency_symbol || 'PKR'),
        price: p.price, availability, url: pageUrl,
      },
    };

    const breadcrumbSchema = {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: siteUrl },
        { '@type': 'ListItem', position: 2, name: p.category, item: `${siteUrl}/#shop` },
        { '@type': 'ListItem', position: 3, name: p.name, item: pageUrl },
      ],
    };

    const galleryHtml = images.length
      ? images.map((img, i) => `<img src="/api/products/images/${img.id}" alt="${esc(p.name)}" ${i === 0 ? 'id="mainProductImage"' : 'style="display:none"'} class="pp-thumb-img" data-img-idx="${i}">`).join('')
      : `<div class="pp-no-image">🐾</div>`;

    const thumbsHtml = images.length > 1 ? `
      <div class="pp-thumbs">
        ${images.map((img, i) => `<button type="button" class="pp-thumb ${i === 0 ? 'active' : ''}" data-thumb="${i}"><img src="/api/products/images/${img.id}" alt=""></button>`).join('')}
      </div>` : '';

    const variantHtml = hasVariants ? `
      <div class="variant-picker" id="ppVariantPicker">
        ${variants.map(v => `<button type="button" class="variant-chip ${v.stock <= 0 ? 'disabled' : ''}" data-variant-id="${v.id}" data-price="${v.price}" data-stock="${v.stock}" ${v.stock <= 0 ? 'disabled' : ''}>${esc(v.label)}${v.stock <= 0 ? ' (out of stock)' : ''}</button>`).join('')}
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(seoTitle)}</title>
<meta name="description" content="${esc(metaDescription)}">
<meta name="robots" content="${esc(robots)}">
${p.focus_keyword ? `<meta name="keywords" content="${esc(p.focus_keyword)}">` : ''}
<link rel="canonical" href="${esc(canonical)}">
<link rel="icon" type="image/x-icon" href="/images/favicon.ico">
<link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/images/favicon-16x16.png">
<link rel="apple-touch-icon" href="/images/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">

<meta property="og:type" content="product">
<meta property="og:title" content="${esc(ogTitle)}">
<meta property="og:description" content="${esc(ogDescription)}">
<meta property="og:image" content="${esc(ogImage)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:site_name" content="${esc(siteName)}">
<meta property="product:price:amount" content="${p.price}">
<meta property="product:price:currency" content="PKR">

<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle)}">
<meta name="twitter:description" content="${esc(ogDescription)}">
<meta name="twitter:image" content="${esc(ogImage)}">

<script type="application/ld+json">${JSON.stringify(productSchema)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/style.css?v=20260821d">
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
      <a href="/blog">Blog</a>
    </nav>
    <div class="header-actions">
      <button class="icon-btn" id="accountBtn" aria-label="Account" onclick="location.href='/'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
      </button>
      <button class="icon-btn" id="cartBtn" aria-label="Open cart" onclick="location.href='/'">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
        <span class="badge-count" id="cartCount" hidden>0</span>
      </button>
    </div>
  </div>
</header>

<nav class="pp-breadcrumb container">
  <a href="/">Home</a> / <a href="/#shop">${esc(p.category)}</a> / <span>${esc(p.name)}</span>
</nav>

<main class="pp-wrap container">
  <div class="pp-gallery">
    <div class="pp-main-image accent-${esc(p.accent)}">${galleryHtml}</div>
    ${thumbsHtml}
  </div>
  <div class="pp-info">
    <span class="product-category">${esc(p.category)}</span>
    <h1>${esc(p.name)}</h1>
    <div class="product-rating"><span class="stars">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}</span> (${p.reviews} reviews)</div>
    ${variantHtml}
    <div class="pp-price-row" id="ppPriceRow">
      <span class="price" id="ppPrice">${hasVariants ? `Rs ${minPrice.toLocaleString('en-PK')}${minPrice !== maxPrice ? ' – Rs ' + maxPrice.toLocaleString('en-PK') : ''}` : `Rs ${p.price.toLocaleString('en-PK')}`}</span>
      ${!hasVariants && p.compare_price ? `<span class="price-compare">Rs ${p.compare_price.toLocaleString('en-PK')}</span>` : ''}
    </div>
    <p id="ppStockNote" style="font-size:0.85rem; color:var(--ink-soft); margin-bottom:16px;">${totalStock > 0 ? `${totalStock} in stock` : 'Currently out of stock'}</p>
    <div class="qv-qty-row" id="ppQtyRow" ${totalStock <= 0 ? 'hidden' : ''}>
      <div class="qty-control" id="ppQtyControl">
        <button type="button" id="ppQtyDec">−</button>
        <span id="ppQty">1</span>
        <button type="button" id="ppQtyInc">+</button>
      </div>
    </div>
    <div class="qv-actions">
      <button class="btn btn--primary" id="ppAddToCart" data-product-id="${p.id}" ${totalStock <= 0 ? 'disabled' : ''}>${totalStock <= 0 ? 'Sold out' : 'Add to cart'}</button>
      <a class="btn btn--whatsapp" id="ppWhatsapp" href="#" target="_blank" rel="noopener">Order on WhatsApp</a>
    </div>
    <div class="pp-description">${p.description || ''}</div>
    ${reviews.length ? `
    <div class="pp-reviews">
      <h2>Customer reviews</h2>
      ${reviews.map(r => `
        <div class="pp-review">
          <div class="pp-review-head">
            <b>${esc(r.author_name)}</b>
            <span class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}</span>
            ${r.source ? `<span class="pp-review-source">via ${esc(r.source)}</span>` : ''}
          </div>
          ${r.review_text ? `<p>${esc(r.review_text)}</p>` : ''}
          <span class="pp-review-date">${new Date(r.review_date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
        </div>
      `).join('')}
    </div>` : ''}
  </div>
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

<a href="#" class="float-whatsapp" id="floatWhatsapp" aria-label="Chat on WhatsApp">💬</a>
<div class="toast" id="toast"></div>

<script src="/js/cart.js?v=20260821d"></script>
<script src="/js/product-page.js?v=20260821d" data-product-id="${p.id}" data-product-name="${esc(p.name)}"></script>
${settings.custom_footer_scripts || ''}
</body>
</html>`;

    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Something went wrong loading this product.');
  }
});

module.exports = router;
