const mysql = require('mysql2/promise');
require('dotenv').config({ quiet: true });

// Hostinger MySQL credentials come from environment variables.
// Locally, create a .env file (see .env.example) with your own values.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'petmax',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initSchema() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        category VARCHAR(100) NOT NULL,
        brand VARCHAR(100) DEFAULT 'Pet Max',
        price INT NOT NULL,
        compare_price INT,
        stock INT NOT NULL DEFAULT 0,
        description TEXT,
        icon VARCHAR(50) NOT NULL DEFAULT 'food',
        accent VARCHAR(50) NOT NULL DEFAULT 'orange',
        badge VARCHAR(100),
        rating DECIMAL(2,1) DEFAULT 4.5,
        reviews INT DEFAULT 0,
        image_data LONGBLOB,
        image_mime VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: add image columns if this table already existed before this update
    const [cols] = await conn.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME IN ('image_data', 'image_mime')
    `);
    const existingCols = cols.map(c => c.COLUMN_NAME);
    if (!existingCols.includes('image_data')) {
      await conn.query('ALTER TABLE products ADD COLUMN image_data LONGBLOB');
    }
    if (!existingCols.includes('image_mime')) {
      await conn.query('ALTER TABLE products ADD COLUMN image_mime VARCHAR(100)');
    }

    // Migration: base SKU field for products without variants
    const [skuCol] = await conn.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'sku'
    `);
    if (skuCol.length === 0) {
      await conn.query('ALTER TABLE products ADD COLUMN sku VARCHAR(100)');
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_images (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        image_data LONGBLOB NOT NULL,
        image_mime VARCHAR(100) NOT NULL,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    // Migration: carry the old single-photo-per-product column forward as each
    // product's first gallery image, so nothing already uploaded gets lost.
    const [alreadyMigrated] = await conn.query('SELECT COUNT(*) AS c FROM product_images');
    if (alreadyMigrated[0].c === 0) {
      const [withOldImage] = await conn.query('SELECT id, image_data, image_mime FROM products WHERE image_data IS NOT NULL');
      for (const p of withOldImage) {
        await conn.query(
          'INSERT INTO product_images (product_id, image_data, image_mime, sort_order) VALUES (?, ?, ?, 0)',
          [p.id, p.image_data, p.image_mime]
        );
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_variants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        product_id INT NOT NULL,
        label VARCHAR(150) NOT NULL,
        sku VARCHAR(100),
        price INT NOT NULL,
        compare_price INT,
        stock INT NOT NULL DEFAULT 0,
        sort_order INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS customers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        phone VARCHAR(50),
        password_hash VARCHAR(255) NULL,
        password_salt VARCHAR(64) NULL,
        google_id VARCHAR(255) NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: existing installs had password_hash/salt as NOT NULL and no google_id —
    // widen them so Google-only accounts (no password at all) can be stored.
    const [pwCol] = await conn.query(`
      SELECT IS_NULLABLE FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'password_hash'
    `);
    if (pwCol[0] && pwCol[0].IS_NULLABLE === 'NO') {
      await conn.query('ALTER TABLE customers MODIFY COLUMN password_hash VARCHAR(255) NULL');
      await conn.query('ALTER TABLE customers MODIFY COLUMN password_salt VARCHAR(64) NULL');
    }
    const [googleIdCol] = await conn.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'customers' AND COLUMN_NAME = 'google_id'
    `);
    if (googleIdCol.length === 0) {
      await conn.query('ALTER TABLE customers ADD COLUMN google_id VARCHAR(255) NULL UNIQUE');
    }

    // Migration: link orders to a registered customer when one placed them (still nullable — guest checkout stays supported)
    const [customerIdCol] = await conn.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'customer_id'
    `);
    if (customerIdCol.length === 0) {
      await conn.query('ALTER TABLE orders ADD COLUMN customer_id INT NULL');
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id INT AUTO_INCREMENT PRIMARY KEY,
        order_code VARCHAR(50) NOT NULL UNIQUE,
        customer_name VARCHAR(255) NOT NULL,
        phone VARCHAR(50) NOT NULL,
        address VARCHAR(500) NOT NULL,
        city VARCHAR(100) NOT NULL,
        notes TEXT,
        payment_method VARCHAR(20) NOT NULL DEFAULT 'cod',
        payment_status VARCHAR(30) NOT NULL DEFAULT 'pending',
        transaction_id VARCHAR(255),
        items TEXT NOT NULL,
        subtotal INT NOT NULL,
        delivery_fee INT NOT NULL DEFAULT 0,
        total INT NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'new',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS subscribers (
        id INT AUTO_INCREMENT PRIMARY KEY,
        contact VARCHAR(255) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        slug VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed categories from whatever product categories already exist, so nothing
    // that's currently live on the storefront silently disappears from this new list.
    const [existingCats] = await conn.query('SELECT COUNT(*) AS c FROM categories');
    if (existingCats[0].c === 0) {
      const [distinctCats] = await conn.query('SELECT DISTINCT category FROM products');
      for (const row of distinctCats) {
        const slug = row.category.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        await conn.query('INSERT IGNORE INTO categories (name, slug) VALUES (?, ?)', [row.category, slug]);
      }
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        setting_key VARCHAR(100) PRIMARY KEY,
        setting_value TEXT
      )
    `);

    // Defaults — these were previously hardcoded placeholders in public/js/main.js
    const defaults = {
      whatsapp_number: '923001234567',
      delivery_fee: '200',
      free_delivery_threshold: '3000',
      currency_symbol: 'Rs',
      bank_account_title: 'Pet Max',
      bank_jazzcash: '',
      bank_easypaisa: '',
      bank_name: '',
      bank_account: '',
      bank_iban: '',
      google_client_id: '', // Google Sign-In is off until the admin adds a real Client ID here
    };
    for (const [key, value] of Object.entries(defaults)) {
      await conn.query('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
    }

    // Homepage content — editable text/images for the existing sections, not a page builder.
    const homepageDefaults = {
      hero_heading: "Everything your cat needs, delivered.",
      hero_subheading: "Premium food, treats, and accessories — hand-picked for Pakistan's pet parents.",
      hero_cta_text: "Shop now",
      banner_text: "",
      banner_link: "",
      featured_category: "",
    };
    for (const [key, value] of Object.entries(homepageDefaults)) {
      await conn.query('INSERT IGNORE INTO settings (setting_key, setting_value) VALUES (?, ?)', [key, value]);
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS blog_posts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        slug VARCHAR(255) NOT NULL UNIQUE,
        excerpt VARCHAR(500),
        content LONGTEXT,
        cover_image_data LONGBLOB,
        cover_image_mime VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'draft',
        published_at TIMESTAMP NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id INT AUTO_INCREMENT PRIMARY KEY,
        code VARCHAR(50) NOT NULL UNIQUE,
        type VARCHAR(20) NOT NULL DEFAULT 'percent',
        value INT NOT NULL,
        min_order INT NOT NULL DEFAULT 0,
        max_uses INT,
        used_count INT NOT NULL DEFAULT 0,
        expires_at TIMESTAMP NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: attach any applied coupon to an order for the admin order table.
    const [couponCol] = await conn.query(`
      SELECT COLUMN_NAME FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'coupon_code'
    `);
    if (couponCol.length === 0) {
      await conn.query('ALTER TABLE orders ADD COLUMN coupon_code VARCHAR(50) NULL');
      await conn.query('ALTER TABLE orders ADD COLUMN discount_amount INT NOT NULL DEFAULT 0');
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        password_salt VARCHAR(64) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'admin',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Bootstrap: migrate the single shared ADMIN_PASSWORD env var into a real
    // admin account the first time this runs, so existing logins keep working.
    const [adminCount] = await conn.query('SELECT COUNT(*) AS c FROM admins');
    if (adminCount[0].c === 0) {
      const crypto = require('crypto');
      const salt = crypto.randomBytes(16).toString('hex');
      const password = process.env.ADMIN_PASSWORD || 'petmax2026';
      const hash = crypto.scryptSync(password, salt, 64).toString('hex');
      await conn.query(
        'INSERT INTO admins (username, password_hash, password_salt, role) VALUES (?, ?, ?, ?)',
        ['admin', hash, salt, 'owner']
      );
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS homepage_slides (
        id INT AUTO_INCREMENT PRIMARY KEY,
        image_data LONGBLOB NOT NULL,
        image_mime VARCHAR(100) NOT NULL,
        heading VARCHAR(255),
        subheading VARCHAR(500),
        link_url VARCHAR(500),
        sort_order INT NOT NULL DEFAULT 0,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // General-purpose named image slots for site customization — hero image today,
    // reusable later for things like the logo or a favicon without a schema change.
    await conn.query(`
      CREATE TABLE IF NOT EXISTS site_images (
        image_key VARCHAR(50) PRIMARY KEY,
        image_data LONGBLOB NOT NULL,
        image_mime VARCHAR(100) NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
  } finally {
    conn.release();
  }
}

module.exports = { pool, initSchema };
