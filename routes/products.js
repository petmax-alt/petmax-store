const express = require('express');
const multer = require('multer');
const router = express.Router();
const { pool } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');

// Images go straight into MySQL — no disk writes, so nothing gets lost on redeploy.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 6 }, // up to 6 photos, 4MB each
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) return cb(new Error('Only image files are allowed'));
    cb(null, true);
  },
});

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

// Never send raw image bytes or the legacy blob column in list/detail JSON.
function stripInternal(row) {
  const { image_data, image_mime, computed_rating, ...rest } = row;
  return rest;
}

async function attachImagesAndVariants(product) {
  const [images] = await pool.query(
    'SELECT id, sort_order FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
    [product.id]
  );
  const [variants] = await pool.query(
    'SELECT id, label, sku, price, compare_price, stock, sort_order FROM product_variants WHERE product_id = ? ORDER BY sort_order ASC, id ASC',
    [product.id]
  );
  const [reviewStats] = await pool.query(
    'SELECT COUNT(*) AS c, AVG(rating) AS avg_rating FROM product_reviews WHERE product_id = ?',
    [product.id]
  );
  const realReviewCount = reviewStats[0].c;
  const realRating = realReviewCount > 0 ? Math.round(reviewStats[0].avg_rating * 10) / 10 : 0;
  return {
    ...product,
    images, has_image: images.length > 0,
    variants, has_variants: variants.length > 0,
    rating: realRating, reviews: realReviewCount, // real data, not the old static seed values
  };
}

// GET /api/products  ?category=&search=&sort=
router.get('/', async (req, res) => {
  try {
    const { category, search, sort } = req.query;
    let sql = `
      SELECT p.*, COALESCE(rv.avg_rating, 0) AS computed_rating
      FROM products p
      LEFT JOIN (SELECT product_id, AVG(rating) AS avg_rating FROM product_reviews GROUP BY product_id) rv
        ON rv.product_id = p.id
      WHERE 1=1
    `;
    const params = [];

    if (category && category !== 'All') {
      sql += ' AND p.category = ?';
      params.push(category);
    }
    if (search) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const sortMap = {
      'price-asc': 'p.price ASC',
      'price-desc': 'p.price DESC',
      'rating': 'computed_rating DESC',
      'newest': 'p.created_at DESC',
    };
    sql += ` ORDER BY ${sortMap[sort] || 'p.created_at DESC'}`;

    const [rows] = await pool.query(sql, params);
    if (rows.length === 0) return res.json([]);

    // One query for image existence + one for variant existence, instead of N+1 per product.
    const ids = rows.map(r => r.id);
    const [imageFlags] = await pool.query(
      `SELECT product_id, MIN(id) AS cover_id FROM product_images WHERE product_id IN (?) GROUP BY product_id`,
      [ids]
    );
    const [variantFlags] = await pool.query(
      `SELECT product_id, COUNT(*) AS c, MIN(price) AS min_price, MAX(price) AS max_price, SUM(stock) AS total_stock FROM product_variants WHERE product_id IN (?) GROUP BY product_id`,
      [ids]
    );
    const [reviewFlags] = await pool.query(
      `SELECT product_id, COUNT(*) AS c, AVG(rating) AS avg_rating FROM product_reviews WHERE product_id IN (?) GROUP BY product_id`,
      [ids]
    );
    const imageMap = new Map(imageFlags.map(r => [r.product_id, true]));
    const variantMap = new Map(variantFlags.map(r => [r.product_id, r]));
    const reviewMap = new Map(reviewFlags.map(r => [r.product_id, r]));

    const out = rows.map(row => {
      const stripped = stripInternal(row);
      const v = variantMap.get(row.id);
      const rv = reviewMap.get(row.id);
      return {
        ...stripped,
        has_image: imageMap.has(row.id),
        has_variants: !!v,
        variant_count: v ? v.c : 0,
        price_range: v ? { min: v.min_price, max: v.max_price } : null,
        stock: v ? v.total_stock : row.stock,
        rating: rv ? Math.round(rv.avg_rating * 10) / 10 : 0,
        reviews: rv ? rv.c : 0,
      };
    });
    res.json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading products.' });
  }
});

// GET /api/products/categories
router.get('/categories', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT DISTINCT category FROM products ORDER BY category');
    res.json(rows.map(r => r.category));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading categories.' });
  }
});

// GET /api/products/image/:id — legacy/primary-photo endpoint. Kept exactly as-is
// on purpose: every existing product card and quick-view already points here,
// and it now transparently serves whichever image has the lowest sort_order.
router.get('/image/:id', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT image_data, image_mime FROM product_images WHERE product_id = ? ORDER BY sort_order ASC, id ASC LIMIT 1',
      [req.params.id]
    );
    const row = rows[0];
    if (!row) return res.status(404).end();
    res.set('Content-Type', row.image_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(row.image_data);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// GET /api/products/images/:imageId — serve one specific gallery image by its own id
router.get('/images/:imageId', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT image_data, image_mime FROM product_images WHERE id = ?', [req.params.imageId]);
    const row = rows[0];
    if (!row) return res.status(404).end();
    res.set('Content-Type', row.image_mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(row.image_data);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
});

// GET /api/products/:slug
router.get('/:slug', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE slug = ?', [req.params.slug]);
    if (!rows[0]) return res.status(404).json({ error: 'Product not found' });
    const full = await attachImagesAndVariants(stripInternal(rows[0]));
    res.json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong loading the product.' });
  }
});

// POST /api/products  (admin only) — multipart/form-data, up to 6 "images" files
router.post('/', requireAdmin, upload.array('images', 6), async (req, res) => {
  const {
    name, category, price, compare_price, stock, description, icon, accent, badge, sku,
    seo_title, meta_description, focus_keyword, canonical_url, meta_robots, og_title, og_description, gtin, mpn, brand,
  } = req.body;
  if (!name || !category || !price) {
    return res.status(400).json({ error: 'name, category and price are required' });
  }
  const slug = slugify(name);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [info] = await conn.query(`
      INSERT INTO products (
        name, slug, category, price, compare_price, stock, description, icon, accent, badge, sku,
        seo_title, meta_description, focus_keyword, canonical_url, meta_robots, og_title, og_description, gtin, mpn, brand
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      name, slug, category, price, compare_price || null, stock || 0, description || '', icon || 'food', accent || 'orange', badge || null, sku || null,
      seo_title || null, meta_description || null, focus_keyword || null, canonical_url || null, meta_robots || 'index,follow',
      og_title || null, og_description || null, gtin || null, mpn || null, brand || 'Pet Max',
    ]);

    const files = req.files || [];
    for (let i = 0; i < files.length; i++) {
      await conn.query(
        'INSERT INTO product_images (product_id, image_data, image_mime, sort_order) VALUES (?, ?, ?, ?)',
        [info.insertId, files[i].buffer, files[i].mimetype, i]
      );
    }

    await conn.commit();
    const [created] = await pool.query('SELECT * FROM products WHERE id = ?', [info.insertId]);
    const full = await attachImagesAndVariants(stripInternal(created[0]));
    res.status(201).json(full);
  } catch (err) {
    await conn.rollback();
    console.error(err);
    res.status(400).json({ error: 'A product with a similar name already exists' });
  } finally {
    conn.release();
  }
});

// PUT /api/products/:id  (admin only) — multipart/form-data.
// New files under "images" are appended to the gallery. Pass remove_image_ids
// as a JSON array string to delete specific existing images in the same request.
router.put('/:id', requireAdmin, upload.array('images', 6), async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const {
      name, category, price, compare_price, stock, description, icon, accent, badge, sku, remove_image_ids,
      seo_title, meta_description, focus_keyword, canonical_url, meta_robots, og_title, og_description, gtin, mpn, brand,
    } = req.body;
    const updated = {
      name: name ?? existing.name,
      category: category ?? existing.category,
      price: price ?? existing.price,
      compare_price: compare_price === '' ? null : (compare_price ?? existing.compare_price),
      stock: stock ?? existing.stock,
      description: description ?? existing.description,
      icon: icon ?? existing.icon,
      accent: accent ?? existing.accent,
      badge: badge === '' ? null : (badge ?? existing.badge),
      sku: sku === '' ? null : (sku ?? existing.sku),
      seo_title: seo_title === '' ? null : (seo_title ?? existing.seo_title),
      meta_description: meta_description === '' ? null : (meta_description ?? existing.meta_description),
      focus_keyword: focus_keyword === '' ? null : (focus_keyword ?? existing.focus_keyword),
      canonical_url: canonical_url === '' ? null : (canonical_url ?? existing.canonical_url),
      meta_robots: meta_robots ?? existing.meta_robots,
      og_title: og_title === '' ? null : (og_title ?? existing.og_title),
      og_description: og_description === '' ? null : (og_description ?? existing.og_description),
      gtin: gtin === '' ? null : (gtin ?? existing.gtin),
      mpn: mpn === '' ? null : (mpn ?? existing.mpn),
      brand: brand === '' ? 'Pet Max' : (brand ?? existing.brand),
    };
    const slug = name ? slugify(name) : existing.slug;

    await pool.query(`
      UPDATE products SET
        name=?, slug=?, category=?, price=?, compare_price=?, stock=?, description=?, icon=?, accent=?, badge=?, sku=?,
        seo_title=?, meta_description=?, focus_keyword=?, canonical_url=?, meta_robots=?, og_title=?, og_description=?, gtin=?, mpn=?, brand=?
      WHERE id=?
    `, [
      updated.name, slug, updated.category, updated.price, updated.compare_price, updated.stock, updated.description, updated.icon, updated.accent, updated.badge, updated.sku,
      updated.seo_title, updated.meta_description, updated.focus_keyword, updated.canonical_url, updated.meta_robots, updated.og_title, updated.og_description, updated.gtin, updated.mpn, updated.brand,
      req.params.id,
    ]);

    if (remove_image_ids) {
      const ids = JSON.parse(remove_image_ids);
      if (Array.isArray(ids) && ids.length) {
        await pool.query('DELETE FROM product_images WHERE id IN (?) AND product_id = ?', [ids, req.params.id]);
      }
    }

    const files = req.files || [];
    if (files.length) {
      const [maxRow] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM product_images WHERE product_id = ?', [req.params.id]);
      let nextOrder = maxRow[0].m + 1;
      for (const f of files) {
        await pool.query(
          'INSERT INTO product_images (product_id, image_data, image_mime, sort_order) VALUES (?, ?, ?, ?)',
          [req.params.id, f.buffer, f.mimetype, nextOrder++]
        );
      }
    }

    const [result] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    const full = await attachImagesAndVariants(stripInternal(result[0]));
    res.json(full);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the product.' });
  }
});

// PUT /api/products/:id/images/order (admin only) — body: { order: [imageId, imageId, ...] }
router.put('/:id/images/order', requireAdmin, async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array of image ids' });
    for (let i = 0; i < order.length; i++) {
      await pool.query('UPDATE product_images SET sort_order = ? WHERE id = ? AND product_id = ?', [i, order[i], req.params.id]);
    }
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong reordering images.' });
  }
});

// DELETE /api/products/:id/images/:imageId (admin only)
router.delete('/:id/images/:imageId', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM product_images WHERE id = ? AND product_id = ?', [req.params.imageId, req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Image not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the image.' });
  }
});

// ---- Variants ----

// POST /api/products/:id/variants (admin only)
router.post('/:id/variants', requireAdmin, async (req, res) => {
  try {
    const { label, sku, price, compare_price, stock } = req.body;
    if (!label || price === undefined) return res.status(400).json({ error: 'label and price are required' });

    const [maxRow] = await pool.query('SELECT COALESCE(MAX(sort_order), -1) AS m FROM product_variants WHERE product_id = ?', [req.params.id]);
    const [info] = await pool.query(`
      INSERT INTO product_variants (product_id, label, sku, price, compare_price, stock, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [req.params.id, label, sku || null, price, compare_price || null, stock || 0, maxRow[0].m + 1]);

    const [created] = await pool.query('SELECT id, label, sku, price, compare_price, stock, sort_order FROM product_variants WHERE id = ?', [info.insertId]);
    res.status(201).json(created[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong adding the variant.' });
  }
});

// PUT /api/products/:id/variants/:variantId (admin only)
router.put('/:id/variants/:variantId', requireAdmin, async (req, res) => {
  try {
    const [existingRows] = await pool.query('SELECT * FROM product_variants WHERE id = ? AND product_id = ?', [req.params.variantId, req.params.id]);
    const existing = existingRows[0];
    if (!existing) return res.status(404).json({ error: 'Variant not found' });

    const { label, sku, price, compare_price, stock } = req.body;
    await pool.query(`
      UPDATE product_variants SET label=?, sku=?, price=?, compare_price=?, stock=? WHERE id=?
    `, [
      label ?? existing.label,
      sku === '' ? null : (sku ?? existing.sku),
      price ?? existing.price,
      compare_price === '' ? null : (compare_price ?? existing.compare_price),
      stock ?? existing.stock,
      req.params.variantId,
    ]);

    const [updated] = await pool.query('SELECT id, label, sku, price, compare_price, stock, sort_order FROM product_variants WHERE id = ?', [req.params.variantId]);
    res.json(updated[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong updating the variant.' });
  }
});

// DELETE /api/products/:id/variants/:variantId (admin only)
router.delete('/:id/variants/:variantId', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM product_variants WHERE id = ? AND product_id = ?', [req.params.variantId, req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Variant not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the variant.' });
  }
});

// PATCH /api/products/:id/stock (admin only) — quick +/- from the Inventory view (base stock only)
router.patch('/:id/stock', requireAdmin, async (req, res) => {
  try {
    const { delta } = req.body;
    if (typeof delta !== 'number') return res.status(400).json({ error: 'delta must be a number' });

    const [existingRows] = await pool.query('SELECT stock FROM products WHERE id = ?', [req.params.id]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Product not found' });

    const newStock = Math.max(0, existingRows[0].stock + delta);
    await pool.query('UPDATE products SET stock = ? WHERE id = ?', [newStock, req.params.id]);
    res.json({ id: Number(req.params.id), stock: newStock });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong adjusting stock.' });
  }
});

// POST /api/products/bulk-delete (admin only) — body: { ids: [1,2,3] }
router.post('/bulk-delete', requireAdmin, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids must be a non-empty array' });
    const [info] = await pool.query('DELETE FROM products WHERE id IN (?)', [ids]);
    res.json({ success: true, deleted: info.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting products.' });
  }
});

// POST /api/products/bulk-category (admin only) — body: { ids: [1,2,3], category: "Cat Food" }
router.post('/bulk-category', requireAdmin, async (req, res) => {
  try {
    const { ids, category } = req.body;
    if (!Array.isArray(ids) || ids.length === 0 || !category) {
      return res.status(400).json({ error: 'ids (array) and category are required' });
    }
    const [info] = await pool.query('UPDATE products SET category = ? WHERE id IN (?)', [category, ids]);
    res.json({ success: true, updated: info.affectedRows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong moving products.' });
  }
});

// DELETE /api/products/:id (admin only)
router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const [info] = await pool.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (info.affectedRows === 0) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong deleting the product.' });
  }
});

module.exports = router;
