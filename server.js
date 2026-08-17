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

app.get('/blog/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'blog-post.html'));
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
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
