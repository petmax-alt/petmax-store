const mysql = require('mysql2/promise');
require('dotenv').config();

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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

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
  } finally {
    conn.release();
  }
}

module.exports = { pool, initSchema };
