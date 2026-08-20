const express = require('express');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// GET /api/products/:productId/reviews — public
router.get('/:productId/reviews', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM product_reviews WHERE product_id = ? ORDER BY review_date DESC, created_at DESC',
      [req.params.productId]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading reviews.' });
  }
});

// POST /api/products/:productId/reviews (admin only)
router.post('/:productId/reviews', requireAdmin, async (req, res) => {
  try {
    const { author_name, rating, review_text, review_date, source } = req.body;
    if (!author_name || !rating) return res.status(400).json({ error: 'Author name and rating are required' });
    const ratingNum = Number(rating);
    if (ratingNum < 1 || ratingNum > 5) return res.status(400).json({ error: 'Rating must be between 1 and 5' });

    const [info] = await pool.query(
      'INSERT INTO product_reviews (product_id, author_name, rating, review_text, review_date, source) VALUES (?, ?, ?, ?, ?, ?)',
      [req.params.productId, author_name.trim(), ratingNum, review_text || '', review_date || new Date().toISOString().slice(0, 10), source || null]
    );
    const [created] = await pool.query('SELECT * FROM product_reviews WHERE id = ?', [info.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong adding the review.' });
  }
});

// DELETE /api/products/:productId/reviews/:reviewId (admin only)
router.delete('/:productId/reviews/:reviewId', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query(
      'DELETE FROM product_reviews WHERE id = ? AND product_id = ?',
      [req.params.reviewId, req.params.productId]
    );
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Review not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the review.' });
  }
});

module.exports = router;
