const { pool, initSchema } = require('./database');

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

const products = [
  // Cat Food
  { name: 'Adult Chicken & Rice Dry Food 1.5kg', category: 'Cat Food', price: 2350, compare_price: 2650, stock: 42, icon: 'food', accent: 'orange', badge: 'Bestseller', rating: 4.8, reviews: 214,
    description: 'A complete, balanced dry food for adult cats built around real chicken and easy-digesting rice. Supports lean muscle and a shiny coat, with no artificial colours.' },
  { name: 'Kitten Growth Formula 1kg', category: 'Cat Food', price: 1950, compare_price: null, stock: 30, icon: 'food', accent: 'navy', badge: 'New', rating: 4.7, reviews: 88,
    description: 'Extra protein and DHA for kittens up to 12 months, sized as small, easy-to-chew kibble for growing jaws.' },
  { name: 'Ocean Fish Wet Food 400g (Pack of 6)', category: 'Cat Food', price: 3100, compare_price: 3500, stock: 25, icon: 'food', accent: 'orange', badge: null, rating: 4.6, reviews: 132,
    description: 'Six pouches of tender fish chunks in gravy — a favourite for fussy eaters and an easy way to add moisture to your cat\'s diet.' },
  { name: 'Senior Cat Formula 1.5kg', category: 'Cat Food', price: 2500, compare_price: null, stock: 18, icon: 'food', accent: 'navy', badge: null, rating: 4.5, reviews: 47,
    description: 'Gentle on ageing digestion, with joint-support glucosamine and reduced calories to help senior cats maintain a healthy weight.' },

  // Cat Treats (Wimow-style)
  { name: 'Tuna Flavour Soft Treats 60g', category: 'Cat Treats', price: 550, compare_price: 650, stock: 80, icon: 'treat', accent: 'orange', badge: 'Bestseller', rating: 4.9, reviews: 301,
    description: 'Natural, grain-free tuna treats your cat will run for. Great for training, bonding, or just spoiling them a little.' },
  { name: 'Chicken Flavour Soft Treats 60g', category: 'Cat Treats', price: 550, compare_price: null, stock: 76, icon: 'treat', accent: 'navy', badge: null, rating: 4.8, reviews: 256,
    description: 'Slow-cooked chicken pressed into bite-sized soft treats — a clean ingredient list your cat and you can both feel good about.' },
  { name: 'Salmon Flavour Soft Treats 60g', category: 'Cat Treats', price: 600, compare_price: null, stock: 54, icon: 'treat', accent: 'orange', badge: 'New', rating: 4.8, reviews: 91,
    description: 'Omega-rich salmon treats that double as a coat-health boost — a light, everyday reward.' },
  { name: 'Creamy Lickable Treats 4-Pack', category: 'Cat Treats', price: 900, compare_price: 1050, stock: 40, icon: 'treat', accent: 'navy', badge: 'Bestseller', rating: 4.9, reviews: 178,
    description: 'Silky, spoonable treats cats lick straight from the tube — brilliant for picky eaters, medicine time, or a quick top-up of hydration.' },
  { name: 'Dental Care Crunchy Bites 90g', category: 'Cat Treats', price: 480, compare_price: null, stock: 60, icon: 'treat', accent: 'orange', badge: null, rating: 4.4, reviews: 63,
    description: 'A crunchy texture designed to help reduce plaque build-up, with a flavour cats genuinely ask for.' },

  // Litter & Accessories
  { name: 'Clumping Bentonite Litter 10L', category: 'Litter & Accessories', price: 1800, compare_price: 2000, stock: 35, icon: 'litter', accent: 'navy', badge: 'Bestseller', rating: 4.7, reviews: 189,
    description: 'Fast-clumping, low-dust litter that locks in odour for days — scoops clean in one go.' },
  { name: 'Unscented Silica Gel Litter 5L', category: 'Litter & Accessories', price: 1450, compare_price: null, stock: 28, icon: 'litter', accent: 'orange', badge: null, rating: 4.5, reviews: 74,
    description: 'Super-absorbent crystal litter that controls odour without added fragrance — ideal for sensitive cats.' },
  { name: 'Foldable Litter Box with Scoop', category: 'Litter & Accessories', price: 2200, compare_price: 2600, stock: 22, icon: 'box', accent: 'navy', badge: 'New', rating: 4.6, reviews: 52,
    description: 'A roomy, easy-clean litter box with high sides to stop scatter, plus a matching scoop included.' },
  { name: 'Litter Mat — Honeycomb Trap', category: 'Litter & Accessories', price: 950, compare_price: null, stock: 45, icon: 'box', accent: 'orange', badge: null, rating: 4.3, reviews: 38,
    description: 'A honeycomb-textured mat that traps stray litter at the door instead of tracking it through your home.' },

  // Grooming
  { name: 'Self-Cleaning Slicker Brush', category: 'Grooming', price: 1100, compare_price: 1300, stock: 33, icon: 'brush', accent: 'orange', badge: 'Bestseller', rating: 4.8, reviews: 146,
    description: 'A retractable brush that pulls loose fur and detangles gently — press one button and the bristles retract for easy clean-up.' },
  { name: 'Oatmeal Cat Shampoo 250ml', category: 'Grooming', price: 850, compare_price: null, stock: 40, icon: 'shampoo', accent: 'navy', badge: null, rating: 4.6, reviews: 61,
    description: 'A tear-free, soap-free wash formulated for sensitive skin, leaving coats soft without stripping natural oils.' },
  { name: 'Nail Clipper with Safety Guard', category: 'Grooming', price: 650, compare_price: null, stock: 50, icon: 'brush', accent: 'orange', badge: null, rating: 4.5, reviews: 39,
    description: 'A precision clipper with a built-in guard to prevent over-cutting — safe, quiet, and quick to use at home.' },

  // Toys
  { name: 'Feather Wand Teaser', category: 'Toys', price: 500, compare_price: null, stock: 70, icon: 'toy', accent: 'orange', badge: null, rating: 4.7, reviews: 98,
    description: 'A springy wand with natural feathers that triggers your cat\'s chase instinct — great for daily play sessions.' },
  { name: 'Catnip Mice 3-Pack', category: 'Toys', price: 400, compare_price: 500, stock: 65, icon: 'toy', accent: 'navy', badge: 'Bestseller', rating: 4.6, reviews: 121,
    description: 'Soft plush mice stuffed with premium catnip — small enough to bat around the whole apartment.' },
  { name: 'Interactive Treat-Dispensing Ball', category: 'Toys', price: 1250, compare_price: 1450, stock: 26, icon: 'toy', accent: 'orange', badge: 'New', rating: 4.7, reviews: 44,
    description: 'A rolling puzzle toy that doles out kibble as your cat plays — mental stimulation and portion control in one.' },
];

async function main() {
  await initSchema();

  const [rows] = await pool.query('SELECT COUNT(*) AS c FROM products');
  if (rows[0].c > 0) {
    console.log(`Skipping seed — ${rows[0].c} products already exist.`);
    process.exit(0);
  }

  for (const item of products) {
    await pool.query(`
      INSERT INTO products (name, slug, category, price, compare_price, stock, description, icon, accent, badge, rating, reviews)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [item.name, slugify(item.name), item.category, item.price, item.compare_price, item.stock, item.description, item.icon, item.accent, item.badge, item.rating, item.reviews]);
  }

  console.log(`Seeded ${products.length} products.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
