// ============================================
// Pet Max — Storefront logic
// ============================================

// --- CONFIG: edit these to match your real details ---
const CONFIG = {
  whatsappNumber: '923001234567', // <-- put your real WhatsApp business number here (no + or spaces)
  bank: {
    accountTitle: 'Pet Max / Hassan',
    jazzcash: '0300-1234567',
    easypaisa: '0300-1234567',
    bankName: 'Meezan Bank',
    bankAccount: '0123456789012',
    iban: 'PK00MEZN0000000123456789',
  },
  freeDeliveryThreshold: 3000,
  deliveryFee: 200,
};

let ALL_PRODUCTS = [];
let CATEGORIES = [];
let CURRENT_CATEGORY = 'All';
let CURRENT_SORT = 'newest';
let CURRENT_SEARCH = '';
let LAST_ORDER = null;

const fmt = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

function waLink(number, text) {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

// ---------------- Data loading ----------------
async function loadCategories() {
  const res = await fetch('/api/products/categories');
  CATEGORIES = await res.json();
  const row = document.getElementById('categoryRow');
  const catIcons = { 'Cat Food': '🍗', 'Cat Treats': '🐟', 'Litter & Accessories': '🧺', 'Grooming': '🪮', 'Toys': '🧶' };
  CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'category-chip';
    btn.dataset.category = cat;
    btn.innerHTML = `<span>${catIcons[cat] || '🐾'}</span> ${cat}`;
    btn.addEventListener('click', () => selectCategory(cat));
    row.appendChild(btn);
  });
  document.querySelector('.category-chip[data-category="All"]').addEventListener('click', () => selectCategory('All'));
}

async function loadProducts() {
  const params = new URLSearchParams();
  if (CURRENT_CATEGORY !== 'All') params.set('category', CURRENT_CATEGORY);
  if (CURRENT_SEARCH) params.set('search', CURRENT_SEARCH);
  params.set('sort', CURRENT_SORT);
  const res = await fetch('/api/products?' + params.toString());
  ALL_PRODUCTS = await res.json();
  renderGrid();
}

function selectCategory(cat) {
  CURRENT_CATEGORY = cat;
  document.querySelectorAll('.category-chip').forEach(c => {
    c.classList.toggle('active', c.dataset.category === cat);
  });
  loadProducts();
}

// ---------------- Render product grid ----------------
function renderGrid() {
  const grid = document.getElementById('productGrid');
  const countEl = document.getElementById('resultCount');
  countEl.textContent = `${ALL_PRODUCTS.length} product${ALL_PRODUCTS.length === 1 ? '' : 's'}`;

  if (ALL_PRODUCTS.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="paw"></div>
        <h3>No products match that</h3>
        <p>Try a different search or category.</p>
      </div>`;
    return;
  }

  grid.innerHTML = ALL_PRODUCTS.map(p => productCardHTML(p)).join('');

  grid.querySelectorAll('[data-quickview]').forEach(el => {
    el.addEventListener('click', () => openQuickView(Number(el.dataset.quickview)));
  });
  grid.querySelectorAll('[data-add]').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      const product = ALL_PRODUCTS.find(p => p.id === Number(el.dataset.add));
      Cart.addItem(product, 1);
      toast(`${product.name} added to cart`);
    });
  });
}

function productCardHTML(p) {
  const outOfStock = p.stock <= 0;
  const lowStock = p.stock > 0 && p.stock <= 5;
  const badge = p.badge
    ? `<span class="product-badge ${p.badge === 'New' ? 'badge-new' : ''}">${p.badge}</span>`
    : '';
  return `
  <div class="product-card">
    <div class="product-media accent-${p.accent}" data-quickview="${p.id}">
      ${badge}
      ${getProductIcon(p.icon, p.accent)}
    </div>
    <div class="product-body">
      <span class="product-category">${p.category}</span>
      <h3 class="product-name" data-quickview="${p.id}" style="cursor:pointer;">${p.name}</h3>
      <div class="product-rating"><span class="stars">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}</span> (${p.reviews})</div>
      <div class="product-price-row">
        <span class="price">${fmt(p.price)}</span>
        ${p.compare_price ? `<span class="price-compare">${fmt(p.compare_price)}</span>` : ''}
      </div>
      ${outOfStock ? '<span class="stock-out">Out of stock</span>' : lowStock ? `<span class="stock-low">Only ${p.stock} left</span>` : ''}
      <div class="product-footer">
        <button class="btn btn--ink" data-add="${p.id}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Sold out' : 'Add to cart'}</button>
      </div>
    </div>
  </div>`;
}

// ---------------- Quick view modal ----------------
function openQuickView(id) {
  const p = ALL_PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const body = document.getElementById('quickViewBody');
  const outOfStock = p.stock <= 0;

  body.innerHTML = `
    <div class="qv-media accent-${p.accent}">${getProductIcon(p.icon, p.accent)}</div>
    <div class="qv-info">
      <span class="product-category">${p.category}</span>
      <h2>${p.name}</h2>
      <div class="product-rating"><span class="stars">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}</span> (${p.reviews} reviews)</div>
      <p class="desc">${p.description || ''}</p>
      <div class="qv-price-row">
        <span class="price">${fmt(p.price)}</span>
        ${p.compare_price ? `<span class="price-compare">${fmt(p.compare_price)}</span>` : ''}
      </div>
      ${outOfStock
        ? '<p class="stock-out">Currently out of stock</p>'
        : `<div class="qv-qty-row">
            <div class="qty-control" id="qvQtyControl">
              <button type="button" data-qv-dec>−</button>
              <span id="qvQty">1</span>
              <button type="button" data-qv-inc>+</button>
            </div>
            <span style="font-size:0.82rem; color:var(--ink-soft);">${p.stock} in stock</span>
          </div>`
      }
      <div class="qv-actions">
        <button class="btn btn--primary" id="qvAddToCart" ${outOfStock ? 'disabled' : ''}>Add to cart</button>
        <a class="btn btn--whatsapp" id="qvWhatsapp" href="#" target="_blank" rel="noopener">Order on WhatsApp</a>
      </div>
    </div>`;

  let qty = 1;
  if (!outOfStock) {
    body.querySelector('[data-qv-inc]').addEventListener('click', () => {
      qty = Math.min(p.stock, qty + 1);
      body.querySelector('#qvQty').textContent = qty;
    });
    body.querySelector('[data-qv-dec]').addEventListener('click', () => {
      qty = Math.max(1, qty - 1);
      body.querySelector('#qvQty').textContent = qty;
    });
    body.querySelector('#qvAddToCart').addEventListener('click', () => {
      Cart.addItem(p, qty);
      toast(`${p.name} added to cart`);
      closeModal(document.getElementById('quickViewModal'));
    });
  }

  const waText = `Hi Pet Max! I'd like to order:\n\n${p.name} — ${fmt(p.price)}\n\nCould you confirm availability and delivery time?`;
  body.querySelector('#qvWhatsapp').href = waLink(CONFIG.whatsappNumber, waText);

  openModal(document.getElementById('quickViewModal'));
}

// ---------------- Modal helpers ----------------
function openModal(modal) {
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeModal(modal) {
  modal.classList.remove('open');
  document.body.style.overflow = '';
}
document.querySelectorAll('[data-close-modal]').forEach(el => {
  el.addEventListener('click', () => closeModal(el.closest('.modal')));
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal.open').forEach(closeModal);
    closeCartDrawer();
  }
});

// ---------------- Cart drawer ----------------
function renderCartDrawer() {
  const items = Cart.getItems();
  const body = document.getElementById('cartBody');
  const foot = document.getElementById('cartFoot');
  const countBadge = document.getElementById('cartCount');
  const totalCount = Cart.count();

  countBadge.hidden = totalCount === 0;
  countBadge.textContent = totalCount;

  if (items.length === 0) {
    body.innerHTML = `
      <div class="drawer-empty">
        <div class="paw"></div>
        <p>Your cart is empty.<br>Add something your cat will love.</p>
      </div>`;
    foot.hidden = true;
    return;
  }

  foot.hidden = false;
  body.innerHTML = items.map(i => `
    <div class="cart-line" data-line="${i.id}">
      <div class="cart-line-thumb accent-${i.accent}">${getProductIcon(i.icon, i.accent)}</div>
      <div class="cart-line-info">
        <div class="name">${i.name}</div>
        <div class="cat">${i.category}</div>
        <div class="cart-line-actions">
          <div class="qty-control">
            <button type="button" data-dec="${i.id}">−</button>
            <span>${i.qty}</span>
            <button type="button" data-inc="${i.id}">+</button>
          </div>
          <span class="line-price">${fmt(i.price * i.qty)}</span>
        </div>
        <button class="remove-line" data-remove="${i.id}">Remove</button>
      </div>
    </div>
  `).join('');

  body.querySelectorAll('[data-inc]').forEach(el => el.addEventListener('click', () => {
    const item = items.find(i => i.id === Number(el.dataset.inc));
    Cart.setQty(item.id, Math.min(item.stock, item.qty + 1));
  }));
  body.querySelectorAll('[data-dec]').forEach(el => el.addEventListener('click', () => {
    const item = items.find(i => i.id === Number(el.dataset.dec));
    Cart.setQty(item.id, item.qty - 1);
  }));
  body.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', () => {
    Cart.removeItem(Number(el.dataset.remove));
    toast('Removed from cart');
  }));

  const subtotal = Cart.subtotal();
  const delivery = subtotal >= CONFIG.freeDeliveryThreshold ? 0 : CONFIG.deliveryFee;
  document.getElementById('cartSubtotal').textContent = fmt(subtotal);
  document.getElementById('cartDelivery').textContent = delivery === 0 ? 'Free' : fmt(delivery);
  document.getElementById('cartTotal').textContent = fmt(subtotal + delivery);

  const noteEl = document.getElementById('freeDeliveryNote');
  if (subtotal < CONFIG.freeDeliveryThreshold) {
    const remaining = CONFIG.freeDeliveryThreshold - subtotal;
    noteEl.innerHTML = `<div class="free-delivery-note"><span class="paw"></span> Add ${fmt(remaining)} more for free delivery</div>`;
  } else {
    noteEl.innerHTML = `<div class="free-delivery-note"><span class="paw"></span> You've unlocked free delivery!</div>`;
  }
}

function openCartDrawer() {
  document.getElementById('overlay').classList.add('open');
  document.getElementById('cartDrawer').classList.add('open');
  document.body.style.overflow = 'hidden';
}
function closeCartDrawer() {
  document.getElementById('overlay').classList.remove('open');
  document.getElementById('cartDrawer').classList.remove('open');
  document.body.style.overflow = '';
}

document.getElementById('cartBtn').addEventListener('click', openCartDrawer);
document.getElementById('closeCart').addEventListener('click', closeCartDrawer);
document.getElementById('overlay').addEventListener('click', closeCartDrawer);
document.addEventListener('cart:changed', renderCartDrawer);

document.getElementById('cartWhatsappBtn').addEventListener('click', () => {
  const items = Cart.getItems();
  if (items.length === 0) return toast('Your cart is empty');
  const lines = items.map(i => `• ${i.name} x${i.qty} — ${fmt(i.price * i.qty)}`).join('\n');
  const subtotal = Cart.subtotal();
  const text = `Hi Pet Max! I'd like to order:\n\n${lines}\n\nSubtotal: ${fmt(subtotal)}\n\nCould you help me confirm delivery and payment?`;
  window.open(waLink(CONFIG.whatsappNumber, text), '_blank');
});

// ---------------- Checkout ----------------
document.getElementById('checkoutBtn').addEventListener('click', () => {
  if (Cart.getItems().length === 0) return toast('Your cart is empty');
  closeCartDrawer();
  renderCheckoutForm();
  openModal(document.getElementById('checkoutModal'));
});

function renderCheckoutForm() {
  const body = document.getElementById('checkoutBody');
  const items = Cart.getItems();
  const subtotal = Cart.subtotal();
  const delivery = subtotal >= CONFIG.freeDeliveryThreshold ? 0 : CONFIG.deliveryFee;
  const total = subtotal + delivery;

  body.innerHTML = `
    <h2>Checkout</h2>
    <p>We'll confirm your order and delivery time right after this.</p>

    <form id="checkoutForm">
      <div class="form-grid">
        <div class="form-field">
          <label for="ck_name">Full name</label>
          <input type="text" id="ck_name" required placeholder="e.g. Hassan Ahmed">
        </div>
        <div class="form-field">
          <label for="ck_phone">Phone number</label>
          <input type="tel" id="ck_phone" required placeholder="03XX-XXXXXXX">
        </div>
      </div>
      <div class="form-field full">
        <label for="ck_address">Delivery address</label>
        <textarea id="ck_address" required placeholder="House / street / area"></textarea>
      </div>
      <div class="form-field full">
        <label for="ck_city">City</label>
        <input type="text" id="ck_city" required placeholder="e.g. Lahore">
      </div>
      <div class="form-field full">
        <label for="ck_notes">Order notes (optional)</label>
        <textarea id="ck_notes" placeholder="Delivery instructions, preferred time, etc."></textarea>
      </div>

      <label style="font-size:0.82rem; font-weight:700; color:var(--ink-soft); display:block; margin-bottom:8px;">Payment method</label>
      <div class="pay-options">
        <div class="pay-option selected" data-pay="cod">
          <b>Cash on Delivery</b>
          <span>Pay when your order arrives</span>
        </div>
        <div class="pay-option" data-pay="online">
          <b>Online payment</b>
          <span>JazzCash / EasyPaisa / bank transfer</span>
        </div>
      </div>

      <div id="onlinePayFields" hidden>
        <div class="bank-details">
          <div class="row"><span>Account title</span><b>${CONFIG.bank.accountTitle}</b></div>
          <div class="row"><span>JazzCash</span><b>${CONFIG.bank.jazzcash}</b></div>
          <div class="row"><span>EasyPaisa</span><b>${CONFIG.bank.easypaisa}</b></div>
          <div class="row"><span>Bank</span><b>${CONFIG.bank.bankName}</b></div>
          <div class="row"><span>IBAN</span><b>${CONFIG.bank.iban}</b></div>
        </div>
        <div class="form-field full">
          <label for="ck_txn">Transaction ID / reference number</label>
          <input type="text" id="ck_txn" placeholder="From your payment app after transfer">
        </div>
      </div>

      <div class="checkout-summary">
        <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        <div class="summary-row"><span>Delivery</span><span>${delivery === 0 ? 'Free' : fmt(delivery)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${fmt(total)}</span></div>
      </div>

      <p class="field-error" id="checkoutError" style="display:none; margin-bottom:12px;"></p>

      <button type="submit" class="btn btn--primary btn--block" id="placeOrderBtn">Place order — ${fmt(total)}</button>
    </form>
  `;

  let paymentMethod = 'cod';
  body.querySelectorAll('.pay-option').forEach(opt => {
    opt.addEventListener('click', () => {
      body.querySelectorAll('.pay-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      paymentMethod = opt.dataset.pay;
      document.getElementById('onlinePayFields').hidden = paymentMethod !== 'online';
    });
  });

  body.querySelector('#checkoutForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('checkoutError');
    errorEl.style.display = 'none';

    const payload = {
      customer_name: document.getElementById('ck_name').value.trim(),
      phone: document.getElementById('ck_phone').value.trim(),
      address: document.getElementById('ck_address').value.trim(),
      city: document.getElementById('ck_city').value.trim(),
      notes: document.getElementById('ck_notes').value.trim(),
      payment_method: paymentMethod,
      transaction_id: paymentMethod === 'online' ? document.getElementById('ck_txn').value.trim() : null,
      items: items.map(i => ({ id: i.id, qty: i.qty })),
    };

    const btn = document.getElementById('placeOrderBtn');
    btn.disabled = true;
    btn.textContent = 'Placing order…';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      LAST_ORDER = data;
      Cart.clear();
      renderOrderSuccess(data);
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = `Place order — ${fmt(total)}`;
    }
  });
}

function renderOrderSuccess(order) {
  const body = document.getElementById('checkoutBody');
  const lines = order.items.map(i => `• ${i.name} x${i.qty} — ${fmt(i.price * i.qty)}`).join('\n');
  const waText = `Hi Pet Max! I just placed order ${order.order_code} (${order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online payment'}) totalling ${fmt(order.total)}. Please confirm!`;

  body.innerHTML = `
    <div class="order-success">
      <div class="check-circle">✓</div>
      <h2>Order placed!</h2>
      <p style="color:var(--ink-soft);">We've got it. Save this code to track your order.</p>
      <div class="order-code">${order.order_code}</div>
      <div class="checkout-summary" style="text-align:left;">
        <div class="summary-row"><span>Name</span><span>${order.customer_name}</span></div>
        <div class="summary-row"><span>Phone</span><span>${order.phone}</span></div>
        <div class="summary-row"><span>Payment</span><span>${order.payment_method === 'cod' ? 'Cash on Delivery' : 'Online payment (verifying)'}</span></div>
        <div class="summary-row total"><span>Total</span><span>${fmt(order.total)}</span></div>
      </div>
      <div style="display:flex; gap:10px; margin-top:20px; flex-wrap:wrap;">
        <a class="btn btn--whatsapp" style="flex:1;" href="${waLink(CONFIG.whatsappNumber, waText)}" target="_blank" rel="noopener">Confirm on WhatsApp</a>
        <button class="btn btn--ghost" style="flex:1;" data-close-modal>Continue shopping</button>
      </div>
    </div>
  `;
  body.querySelectorAll('[data-close-modal]').forEach(el => {
    el.addEventListener('click', () => closeModal(document.getElementById('checkoutModal')));
  });
}

// ---------------- Track order ----------------
document.getElementById('trackOrderLink').addEventListener('click', (e) => {
  e.preventDefault();
  renderTrackForm();
  openModal(document.getElementById('trackModal'));
});

function renderTrackForm() {
  const body = document.getElementById('trackBody');
  body.innerHTML = `
    <h2>Track your order</h2>
    <p>Enter the order code we gave you at checkout.</p>
    <div class="form-field full">
      <label for="trackCode">Order code</label>
      <input type="text" id="trackCode" placeholder="e.g. PM-AB12C34">
    </div>
    <button class="btn btn--primary btn--block" id="trackSubmit">Track order</button>
    <div id="trackResult" style="margin-top:18px;"></div>
  `;
  body.querySelector('#trackSubmit').addEventListener('click', async () => {
    const code = body.querySelector('#trackCode').value.trim();
    const resultEl = body.querySelector('#trackResult');
    if (!code) return;
    resultEl.innerHTML = 'Looking it up…';
    try {
      const res = await fetch(`/api/orders/track/${encodeURIComponent(code)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Order not found');
      resultEl.innerHTML = `
        <div class="checkout-summary" style="text-align:left;">
          <div class="summary-row"><span>Status</span><span style="text-transform:capitalize;">${data.status}</span></div>
          <div class="summary-row"><span>Payment</span><span style="text-transform:capitalize;">${data.payment_status.replace('_', ' ')}</span></div>
          <div class="summary-row total"><span>Total</span><span>${fmt(data.total)}</span></div>
        </div>`;
    } catch (err) {
      resultEl.innerHTML = `<p class="field-error">${err.message}</p>`;
    }
  });
}

// ---------------- Search / sort ----------------
let searchDebounce;
document.getElementById('searchInput').addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    CURRENT_SEARCH = e.target.value.trim();
    loadProducts();
  }, 280);
});
document.getElementById('sortSelect').addEventListener('change', (e) => {
  CURRENT_SORT = e.target.value;
  loadProducts();
});

// ---------------- Footer category links ----------------
document.querySelectorAll('[data-cat-link]').forEach(el => {
  el.addEventListener('click', (e) => {
    e.preventDefault();
    selectCategory(el.dataset.catLink);
    document.getElementById('shop').scrollIntoView({ behavior: 'smooth' });
  });
});

// ---------------- WhatsApp buttons (generic) ----------------
const genericWaText = `Hi Pet Max! I'd like to ask about your products for my cat.`;
['heroWhatsapp', 'footerWhatsapp', 'floatWhatsapp'].forEach(id => {
  const el = document.getElementById(id);
  if (el) {
    el.href = waLink(CONFIG.whatsappNumber, genericWaText);
    el.target = '_blank';
    el.rel = 'noopener';
  }
});

// ---------------- Init ----------------
document.getElementById('year').textContent = new Date().getFullYear();
(async function init() {
  await loadCategories();
  await loadProducts();
  renderCartDrawer();
})();
