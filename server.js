const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const path = require('path');

const { initSchema } = require('./db/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cookieParser());
app.use(session({
  secret: process.env.SESSION_SECRET || 'petmax-dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 30 }, // 30 days — customers shouldn't have to re-login every visit
}));

app.use('/api/products', require('./routes/products'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/customers', require('./routes/customers').router);
app.use('/api/blog', require('./routes/blog'));
app.use('/api/coupons', require('./routes/coupons'));
app.use('/api/slides', require('./routes/slides'));
app.use('/api/site-images', require('./routes/site-images'));
app.use('/api/redirects', require('./routes/redirects'));
app.use('/api/products', require('./routes/reviews'));
app.use('/api/pages', require('./routes/pages'));
app.use('/api/contact', require('./routes/contact'));

app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res) => {
    // Always revalidate CSS/JS with the server instead of trusting browser cache guesses.
    // Prevents the "I pushed a fix but my browser won't show it" problem.
    res.setHeader('Cache-Control', 'no-cache');
  },
}));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

app.get('/blog', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog.html'));
});

app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

app.use('/', require('./routes/product-page'));
app.use('/', require('./routes/blog-page'));
app.use('/', require('./routes/category-page'));
app.use('/', require('./routes/seo'));
app.use('/', require('./routes/page-page')); // catch-all single-segment slugs — must stay last

// 301/302 redirects, checked after all real routes so nothing legitimate gets hijacked
app.use(async (req, res, next) => {
  try {
    const { pool } = require('./db/database');
    const [rows] = await pool.query('SELECT * FROM redirects WHERE from_path = ?', [req.path]);
    if (rows[0]) return res.redirect(rows[0].status_code, rows[0].to_path);
  } catch (err) {
    // If the redirect lookup fails for any reason, just fall through to normal 404 handling.
  }
  next();
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  // Real 404 status, not a silent "soft 404" — Google penalizes pages that claim
  // to be broken links but respond 200, so this matters for crawl quality.
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🐾 Pet Max is running at http://localhost:${PORT}`);
      console.log(`   Admin panel: http://localhost:${PORT}/admin (default password: petmax2026)`);
    });
  })
  .catch((err) => {
    console.error('❌ Could not connect to the database. Check your .env DB settings.');
    console.error(err.message);
    process.exit(1);
  });
