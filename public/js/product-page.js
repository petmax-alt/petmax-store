// ============================================
// Pet Max — Product page interactivity
// (server already rendered the SEO-critical HTML; this just wires up
// the gallery, variant picker, quantity control, and add-to-cart)
// ============================================

const fmt = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;
function waLink(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

function toast(msg, isError) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.toggle('toast--error', !!isError);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function updateCartBadge() {
  const badge = document.getElementById('cartCount');
  if (!badge) return;
  const count = Cart.count();
  badge.textContent = count;
  badge.hidden = count === 0;
}
document.addEventListener('cart:changed', updateCartBadge);

(async function init() {
  document.getElementById('year').textContent = new Date().getFullYear();
  updateCartBadge();

  const scriptTag = document.querySelector('script[data-product-id]');
  const productId = scriptTag.dataset.productId;

  const settingsRes = await fetch('/api/settings');
  const settings = await settingsRes.json();
  const whatsappNumber = settings.whatsapp_number || '923001234567';

  // Fetch the full product (need variant stock/price and category/icon for Cart.addItem)
  const path = location.pathname.split('/product/')[1];
  const productRes2 = await fetch(`/api/products/${path}`);
  const product = await productRes2.json();

  let selectedVariant = product.has_variants ? product.variants.find(v => v.stock > 0) || product.variants[0] : null;
  let qty = 1;

  function currentPrice() { return selectedVariant ? selectedVariant.price : product.price; }
  function currentStock() { return selectedVariant ? selectedVariant.stock : product.stock; }

  function updatePriceStockUI() {
    document.getElementById('ppPrice').textContent = fmt(currentPrice());
    const stockNote = document.getElementById('ppStockNote');
    const outOfStock = currentStock() <= 0;
    stockNote.textContent = outOfStock ? 'Currently out of stock' : `${currentStock()} in stock`;
    document.getElementById('ppQtyRow').hidden = outOfStock;
    const addBtn = document.getElementById('ppAddToCart');
    addBtn.disabled = outOfStock;
    addBtn.textContent = outOfStock ? 'Sold out' : 'Add to cart';
    qty = 1;
    const qtyEl = document.getElementById('ppQty');
    if (qtyEl) qtyEl.textContent = qty;
  }

  // Variant chips
  document.querySelectorAll('[data-variant-id]').forEach(chip => {
    chip.addEventListener('click', () => {
      if (chip.disabled) return;
      selectedVariant = product.variants.find(v => v.id === Number(chip.dataset.variantId));
      document.querySelectorAll('[data-variant-id]').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      updatePriceStockUI();
    });
  });
  const firstChip = document.querySelector('[data-variant-id]:not([disabled])');
  if (firstChip) firstChip.classList.add('active');

  // Gallery thumbnails
  document.querySelectorAll('[data-thumb]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = btn.dataset.thumb;
      document.querySelectorAll('.pp-thumb-img').forEach(img => { img.style.display = 'none'; });
      document.querySelector(`.pp-thumb-img[data-img-idx="${idx}"]`).style.display = 'block';
      document.querySelectorAll('.pp-thumb').forEach(t => t.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Quantity control
  const qtyDec = document.getElementById('ppQtyDec');
  const qtyInc = document.getElementById('ppQtyInc');
  if (qtyDec) qtyDec.addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    document.getElementById('ppQty').textContent = qty;
  });
  if (qtyInc) qtyInc.addEventListener('click', () => {
    qty = Math.min(currentStock(), qty + 1);
    document.getElementById('ppQty').textContent = qty;
  });

  // Add to cart
  document.getElementById('ppAddToCart').addEventListener('click', () => {
    Cart.addItem(product, qty, selectedVariant);
    toast(`${product.name} added to cart`);
    updateCartBadge();
  });

  // WhatsApp buttons
  const waText = `Hi Pet Max! I'd like to order:\n\n${product.name}${selectedVariant ? ' — ' + selectedVariant.label : ''} — ${fmt(currentPrice())}\n\nCould you confirm availability and delivery time?`;
  ['ppWhatsapp', 'floatWhatsapp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.href = waLink(whatsappNumber, waText); el.target = '_blank'; el.rel = 'noopener'; }
  });

  updatePriceStockUI();
})();
