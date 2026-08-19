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
  googleClientId: '', // set via Store Settings — Google Sign-In stays off until this is filled in
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
      if (product.has_variants) {
        openQuickView(product.id); // must pick an option first
        return;
      }
      Cart.addItem(product, 1);
      toast(`${product.name} added to cart`);
    });
  });

  initScrollAnimations(); // re-observe: this grid just replaced its contents with new [data-animate] cards
}

function productCardHTML(p) {
  const outOfStock = p.stock <= 0;
  const lowStock = p.stock > 0 && p.stock <= 5;
  const badge = p.badge
    ? `<span class="product-badge ${p.badge === 'New' ? 'badge-new' : ''}">${p.badge}</span>`
    : '';
  return `
  <div class="product-card" data-animate="fade">
    <div class="product-media accent-${p.accent}" data-quickview="${p.id}">
      ${badge}
      ${p.has_image ? `<img src="/api/products/image/${p.id}" alt="${p.name}" class="product-photo">` : getProductIcon(p.icon, p.accent)}
    </div>
    <div class="product-body">
      <span class="product-category">${p.category}</span>
      <a href="/product/${p.slug}"><h3 class="product-name">${p.name}</h3></a>
      <div class="product-rating"><span class="stars">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}</span> (${p.reviews})</div>
      <div class="product-price-row">
        ${p.has_variants
          ? `<span class="price">${fmt(p.price_range.min)}${p.price_range.min !== p.price_range.max ? ' – ' + fmt(p.price_range.max) : ''}</span>`
          : `<span class="price">${fmt(p.price)}</span>${p.compare_price ? `<span class="price-compare">${fmt(p.compare_price)}</span>` : ''}`
        }
      </div>
      ${outOfStock ? '<span class="stock-out">Out of stock</span>' : lowStock ? `<span class="stock-low">Only ${p.stock} left</span>` : ''}
      <div class="product-footer">
        <button class="btn btn--ink" data-add="${p.id}" ${outOfStock ? 'disabled' : ''}>${outOfStock ? 'Sold out' : p.has_variants ? 'Choose options' : 'Add to cart'}</button>
      </div>
    </div>
  </div>`;
}

// ---------------- Quick view modal ----------------
async function openQuickView(id) {
  const listVersion = ALL_PRODUCTS.find(x => x.id === id);
  if (!listVersion) return;
  // The list endpoint only has aggregate variant data — fetch the full detail
  // (individual variants, full gallery) before rendering the picker.
  const res = await fetch(`/api/products/${listVersion.slug}`);
  const p = await res.json();

  const body = document.getElementById('quickViewBody');
  let selectedVariant = p.has_variants ? p.variants.find(v => v.stock > 0) || p.variants[0] : null;
  let activeImageIdx = 0;
  const galleryImages = p.images && p.images.length ? p.images : (p.has_image ? [{ id: p.id, legacy: true }] : []);

  function currentPrice() { return selectedVariant ? selectedVariant.price : p.price; }
  function currentStock() { return selectedVariant ? selectedVariant.stock : p.stock; }
  function currentOutOfStock() { return currentStock() <= 0; }

  function imageSrc(img) {
    return img.legacy ? `/api/products/image/${img.id}` : `/api/products/images/${img.id}`;
  }

  function galleryHTML() {
    if (galleryImages.length === 0) {
      return `<div class="qv-media accent-${p.accent}">${getProductIcon(p.icon, p.accent)}</div>`;
    }
    return `
      <div class="qv-gallery">
        <div class="qv-media accent-${p.accent} qv-media--photo">
          <img src="${imageSrc(galleryImages[activeImageIdx])}" alt="${p.name}" class="product-photo qv-active-photo" key="${activeImageIdx}">
        </div>
        ${galleryImages.length > 1 ? `
          <div class="qv-thumbs">
            ${galleryImages.map((img, i) => `
              <button type="button" class="qv-thumb ${i === activeImageIdx ? 'active' : ''}" data-thumb="${i}">
                <img src="${imageSrc(img)}" alt="Photo ${i + 1}">
              </button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  function variantPickerHTML() {
    if (!p.has_variants) return '';
    return `<div class="variant-picker">
      ${p.variants.map(v => `
        <button type="button" class="variant-chip ${v.id === selectedVariant.id ? 'active' : ''} ${v.stock <= 0 ? 'disabled' : ''}"
          data-variant="${v.id}" ${v.stock <= 0 ? 'disabled' : ''}>${v.label}${v.stock <= 0 ? ' (out of stock)' : ''}</button>
      `).join('')}
    </div>`;
  }

  function render() {
    const outOfStock = currentOutOfStock();
    body.innerHTML = `
      ${galleryHTML()}
      <div class="qv-info">
        <span class="product-category">${p.category}</span>
        <h2>${p.name}</h2>
        <div class="product-rating"><span class="stars">${'★'.repeat(Math.round(p.rating))}${'☆'.repeat(5 - Math.round(p.rating))}</span> (${p.reviews} reviews)</div>
        <p class="desc">${p.description || ''}</p>
        ${variantPickerHTML()}
        <div class="qv-price-row">
          <span class="price">${fmt(currentPrice())}</span>
          ${!p.has_variants && p.compare_price ? `<span class="price-compare">${fmt(p.compare_price)}</span>` : ''}
        </div>
        ${outOfStock
          ? '<p class="stock-out">Currently out of stock</p>'
          : `<div class="qv-qty-row">
              <div class="qty-control" id="qvQtyControl">
                <button type="button" data-qv-dec>−</button>
                <span id="qvQty">1</span>
                <button type="button" data-qv-inc>+</button>
              </div>
              <span style="font-size:0.82rem; color:var(--ink-soft);">${currentStock()} in stock</span>
            </div>`
        }
        <div class="qv-actions">
          <button class="btn btn--primary" id="qvAddToCart" ${outOfStock ? 'disabled' : ''}>Add to cart</button>
          <a class="btn btn--whatsapp" id="qvWhatsapp" href="#" target="_blank" rel="noopener">Order on WhatsApp</a>
        </div>
      </div>`;

    body.querySelectorAll('[data-thumb]').forEach(thumb => {
      thumb.addEventListener('click', () => {
        activeImageIdx = Number(thumb.dataset.thumb);
        render();
      });
    });

    body.querySelectorAll('[data-variant]').forEach(chip => {
      chip.addEventListener('click', () => {
        selectedVariant = p.variants.find(v => v.id === Number(chip.dataset.variant));
        render();
      });
    });

    let qty = 1;
    if (!outOfStock) {
      body.querySelector('[data-qv-inc]').addEventListener('click', () => {
        qty = Math.min(currentStock(), qty + 1);
        body.querySelector('#qvQty').textContent = qty;
      });
      body.querySelector('[data-qv-dec]').addEventListener('click', () => {
        qty = Math.max(1, qty - 1);
        body.querySelector('#qvQty').textContent = qty;
      });
      body.querySelector('#qvAddToCart').addEventListener('click', () => {
        Cart.addItem(p, qty, selectedVariant);
        toast(`${p.name} added to cart`);
        closeModal(document.getElementById('quickViewModal'));
      });
    }

    const waText = `Hi Pet Max! I'd like to order:\n\n${p.name}${selectedVariant ? ' — ' + selectedVariant.label : ''} — ${fmt(currentPrice())}\n\nCould you confirm availability and delivery time?`;
    body.querySelector('#qvWhatsapp').href = waLink(CONFIG.whatsappNumber, waText);
  }

  render();
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
  body.innerHTML = items.map((i, idx) => `
    <div class="cart-line" data-line="${idx}">
      <div class="cart-line-thumb accent-${i.accent}">${getProductIcon(i.icon, i.accent)}</div>
      <div class="cart-line-info">
        <div class="name">${i.name}</div>
        <div class="cat">${i.category}</div>
        <div class="cart-line-actions">
          <div class="qty-control">
            <button type="button" data-dec="${idx}">−</button>
            <span>${i.qty}</span>
            <button type="button" data-inc="${idx}">+</button>
          </div>
          <span class="line-price">${fmt(i.price * i.qty)}</span>
        </div>
        <button class="remove-line" data-remove="${idx}">Remove</button>
      </div>
    </div>
  `).join('');

  body.querySelectorAll('[data-inc]').forEach(el => el.addEventListener('click', () => {
    const item = items[Number(el.dataset.inc)];
    Cart.setQty(item.id, Math.min(item.stock, item.qty + 1), item.variant_id);
  }));
  body.querySelectorAll('[data-dec]').forEach(el => el.addEventListener('click', () => {
    const item = items[Number(el.dataset.dec)];
    Cart.setQty(item.id, item.qty - 1, item.variant_id);
  }));
  body.querySelectorAll('[data-remove]').forEach(el => el.addEventListener('click', () => {
    const item = items[Number(el.dataset.remove)];
    Cart.removeItem(item.id, item.variant_id);
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

// ---------------- Customer account ----------------
let CURRENT_CUSTOMER = null;

async function loadCurrentCustomer() {
  const res = await fetch('/api/customers/me');
  CURRENT_CUSTOMER = await res.json();
  updateAccountIcon();
}

function updateAccountIcon() {
  const btn = document.getElementById('accountBtn');
  btn.title = CURRENT_CUSTOMER ? `${CURRENT_CUSTOMER.name} — My account` : 'Sign in';
}

function renderGoogleButton() {
  const wrap = document.getElementById('googleSignInWrap');
  const divider = document.getElementById('authDivider');
  if (!wrap) return;
  if (!CONFIG.googleClientId || !window.google || !window.google.accounts) {
    wrap.hidden = true;
    if (divider) divider.hidden = true;
    return;
  }
  wrap.hidden = false;
  if (divider) divider.hidden = false;
  wrap.innerHTML = '';
  google.accounts.id.initialize({
    client_id: CONFIG.googleClientId,
    callback: handleGoogleCredential,
  });
  google.accounts.id.renderButton(wrap, { theme: 'outline', size: 'large', width: 360, text: 'continue_with' });
}

async function handleGoogleCredential(response) {
  try {
    const res = await fetch('/api/customers/google', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    CURRENT_CUSTOMER = data;
    updateAccountIcon();
    toast(`Welcome, ${data.name.split(' ')[0]}`);
    renderAccountModal();
  } catch (err) {
    toast(err.message || 'Could not sign in with Google', true);
  }
}

function renderAccountModal() {
  const body = document.getElementById('accountBody');
  if (CURRENT_CUSTOMER) {
    body.innerHTML = `
      <h2>Hi, ${CURRENT_CUSTOMER.name.split(' ')[0]}</h2>
      <p>${CURRENT_CUSTOMER.email}</p>
      <div id="myOrdersList" style="margin:18px 0; max-height:320px; overflow-y:auto;"><p style="color:var(--ink-soft); font-size:0.88rem;">Loading your orders…</p></div>
      <button class="btn btn--ghost" id="accountLogoutBtn" style="width:100%;">Log out</button>
    `;
    fetch('/api/customers/me/orders').then(r => r.json()).then(orders => {
      const list = document.getElementById('myOrdersList');
      if (!list) return;
      list.innerHTML = orders.length ? orders.map(o => `
        <div style="padding:12px 0; border-bottom:1px solid var(--sand-line);">
          <div style="display:flex; justify-content:space-between; font-weight:700;"><span>${o.order_code}</span><span>${fmt(o.total)}</span></div>
          <div style="font-size:0.8rem; color:var(--ink-soft); margin-top:2px;">${new Date(o.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })} · ${o.status}</div>
        </div>
      `).join('') : `<p style="color:var(--ink-soft); font-size:0.88rem;">No orders yet.</p>`;
    });
    document.getElementById('accountLogoutBtn').addEventListener('click', async () => {
      await fetch('/api/customers/logout', { method: 'POST' });
      CURRENT_CUSTOMER = null;
      updateAccountIcon();
      closeModal(document.getElementById('accountModal'));
      toast('Logged out');
    });
    return;
  }

  body.innerHTML = `
    <div id="googleSignInWrap" style="margin-bottom:14px;"></div>
    <div class="auth-divider" id="authDivider"><span>or</span></div>
    <div class="auth-tabs">
      <button type="button" class="auth-tab active" data-tab="login">Log in</button>
      <button type="button" class="auth-tab" data-tab="signup">Sign up</button>
    </div>
    <form id="loginForm" class="form-grid" style="margin-top:16px;">
      <div class="form-field full"><label for="lg_email">Email</label><input type="email" id="lg_email" required></div>
      <div class="form-field full"><label for="lg_password">Password</label><input type="password" id="lg_password" required></div>
      <p class="field-error" id="loginError" style="display:none; grid-column:1/-1;"></p>
      <button type="submit" class="btn btn--primary" style="grid-column:1/-1;">Log in</button>
    </form>
    <form id="signupForm" class="form-grid" hidden style="margin-top:16px;">
      <div class="form-field full"><label for="su_name">Full name</label><input type="text" id="su_name" required></div>
      <div class="form-field full"><label for="su_email">Email</label><input type="email" id="su_email" required></div>
      <div class="form-field full"><label for="su_phone">Phone (optional)</label><input type="tel" id="su_phone"></div>
      <div class="form-field full"><label for="su_password">Password</label><input type="password" id="su_password" required minlength="6"></div>
      <p class="field-error" id="signupError" style="display:none; grid-column:1/-1;"></p>
      <button type="submit" class="btn btn--primary" style="grid-column:1/-1;">Create account</button>
    </form>
  `;

  renderGoogleButton();

  body.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      body.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('loginForm').hidden = tab.dataset.tab !== 'login';
      document.getElementById('signupForm').hidden = tab.dataset.tab !== 'signup';
    });
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('loginError');
    errorEl.style.display = 'none';
    try {
      const res = await fetch('/api/customers/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: document.getElementById('lg_email').value, password: document.getElementById('lg_password').value }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      CURRENT_CUSTOMER = data;
      updateAccountIcon();
      toast(`Welcome back, ${data.name.split(' ')[0]}`);
      renderAccountModal();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });

  document.getElementById('signupForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById('signupError');
    errorEl.style.display = 'none';
    try {
      const res = await fetch('/api/customers/signup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: document.getElementById('su_name').value,
          email: document.getElementById('su_email').value,
          phone: document.getElementById('su_phone').value,
          password: document.getElementById('su_password').value,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      CURRENT_CUSTOMER = data;
      updateAccountIcon();
      toast(`Welcome, ${data.name.split(' ')[0]}`);
      renderAccountModal();
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
    }
  });
}

document.getElementById('accountBtn').addEventListener('click', () => {
  renderAccountModal();
  openModal(document.getElementById('accountModal'));
});

function renderCheckoutForm() {
  const body = document.getElementById('checkoutBody');
  const items = Cart.getItems();
  const subtotal = Cart.subtotal();
  const delivery = subtotal >= CONFIG.freeDeliveryThreshold ? 0 : CONFIG.deliveryFee;
  let appliedCoupon = null; // { code, discount }

  function currentTotal() {
    return Math.max(0, subtotal + delivery - (appliedCoupon ? appliedCoupon.discount : 0));
  }

  function renderSummary() {
    const summaryEl = body.querySelector('.checkout-summary');
    summaryEl.innerHTML = `
      <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
      <div class="summary-row"><span>Delivery</span><span>${delivery === 0 ? 'Free' : fmt(delivery)}</span></div>
      ${appliedCoupon ? `<div class="summary-row" style="color:#1DAE55;"><span>Coupon (${appliedCoupon.code})</span><span>−${fmt(appliedCoupon.discount)}</span></div>` : ''}
      <div class="summary-row total"><span>Total</span><span>${fmt(currentTotal())}</span></div>
    `;
    body.querySelector('#placeOrderBtn').textContent = `Place order — ${fmt(currentTotal())}`;
  }

  body.innerHTML = `
    <h2>Checkout</h2>
    <p>We'll confirm your order and delivery time right after this.</p>

    <form id="checkoutForm">
      <div class="form-grid">
        <div class="form-field">
          <label for="ck_name">Full name</label>
          <input type="text" id="ck_name" required placeholder="e.g. Hassan Ahmed" value="${CURRENT_CUSTOMER ? CURRENT_CUSTOMER.name : ''}">
        </div>
        <div class="form-field">
          <label for="ck_phone">Phone number</label>
          <input type="tel" id="ck_phone" required placeholder="03XX-XXXXXXX" value="${CURRENT_CUSTOMER && CURRENT_CUSTOMER.phone ? CURRENT_CUSTOMER.phone : ''}">
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

      <div class="form-field full">
        <label for="ck_coupon">Coupon code (optional)</label>
        <div style="display:flex; gap:8px;">
          <input type="text" id="ck_coupon" placeholder="e.g. AZADI15" style="text-transform:uppercase;">
          <button type="button" class="btn btn--ghost" id="applyCouponBtn" style="flex:none;">Apply</button>
        </div>
        <p id="couponMsg" style="font-size:0.82rem; margin-top:6px;"></p>
      </div>

      <div class="checkout-summary">
        <div class="summary-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
        <div class="summary-row"><span>Delivery</span><span>${delivery === 0 ? 'Free' : fmt(delivery)}</span></div>
        <div class="summary-row total"><span>Total</span><span>${fmt(currentTotal())}</span></div>
      </div>

      <p class="field-error" id="checkoutError" style="display:none; margin-bottom:12px;"></p>

      <button type="submit" class="btn btn--primary btn--block" id="placeOrderBtn">Place order — ${fmt(currentTotal())}</button>
    </form>
  `;

  body.querySelector('#applyCouponBtn').addEventListener('click', async () => {
    const code = document.getElementById('ck_coupon').value.trim();
    const msgEl = document.getElementById('couponMsg');
    if (!code) return;
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, subtotal }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      appliedCoupon = { code: data.code, discount: data.discount };
      msgEl.style.color = '#1DAE55';
      msgEl.textContent = `Coupon applied — you saved ${fmt(data.discount)}`;
      renderSummary();
    } catch (err) {
      appliedCoupon = null;
      msgEl.style.color = '#C23B3B';
      msgEl.textContent = err.message;
      renderSummary();
    }
  });

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
      items: items.map(i => ({ id: i.id, qty: i.qty, variant_id: i.variant_id || null })),
      coupon_code: appliedCoupon ? appliedCoupon.code : null,
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
function wireGenericWhatsappButtons() {
  const genericWaText = `Hi Pet Max! I'd like to ask about your products for my cat.`;
  ['heroWhatsapp', 'footerWhatsapp', 'floatWhatsapp'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.href = waLink(CONFIG.whatsappNumber, genericWaText);
      el.target = '_blank';
      el.rel = 'noopener';
    }
  });
}

// ---------------- Init ----------------
document.getElementById('year').textContent = new Date().getFullYear();
async function loadSiteSettings() {
  try {
    const res = await fetch('/api/settings');
    const s = await res.json();
    if (s.whatsapp_number) CONFIG.whatsappNumber = s.whatsapp_number;
    if (s.delivery_fee) CONFIG.deliveryFee = Number(s.delivery_fee);
    if (s.free_delivery_threshold) CONFIG.freeDeliveryThreshold = Number(s.free_delivery_threshold);
    if (s.bank_account_title) CONFIG.bank.accountTitle = s.bank_account_title;
    if (s.bank_jazzcash) CONFIG.bank.jazzcash = s.bank_jazzcash;
    if (s.bank_easypaisa) CONFIG.bank.easypaisa = s.bank_easypaisa;
    if (s.bank_name) CONFIG.bank.bankName = s.bank_name;
    if (s.bank_account) CONFIG.bank.bankAccount = s.bank_account;
    if (s.bank_iban) CONFIG.bank.iban = s.bank_iban;

    // Homepage content — only override the default markup if the admin actually set something.
    if (s.hero_heading) document.getElementById('heroHeading').textContent = s.hero_heading;
    if (s.hero_subheading) document.getElementById('heroSubheading').textContent = s.hero_subheading;
    if (s.hero_cta_text) document.getElementById('heroCtaBtn').textContent = s.hero_cta_text;
    if (s.banner_text) {
      const banner = document.getElementById('siteBanner');
      banner.hidden = false;
      banner.innerHTML = s.banner_link ? `<a href="${s.banner_link}">${s.banner_text}</a>` : s.banner_text;
    }
    if (s.google_client_id) CONFIG.googleClientId = s.google_client_id;
  } catch (err) {
    // If this fails, the storefront still works using the hardcoded fallback values above.
    console.warn('Could not load live settings, using defaults', err);
  }
}

async function loadCarousel() {
  const res = await fetch('/api/slides');
  const slides = await res.json();
  if (slides.length === 0) return; // keep it hidden — no slides configured, nothing changes visually

  const section = document.getElementById('homepageCarousel');
  const track = document.getElementById('carouselTrack');
  const dotsWrap = document.getElementById('carouselDots');
  let current = 0;
  let timer = null;

  track.innerHTML = slides.map(s => `
    <div class="carousel-slide">
      ${s.link_url ? `<a href="${s.link_url}">` : ''}
      <img src="/api/slides/image/${s.id}" alt="${s.heading || 'Pet Max'}">
      ${(s.heading || s.subheading) ? `<div class="carousel-slide-copy">${s.heading ? `<h2>${s.heading}</h2>` : ''}${s.subheading ? `<p>${s.subheading}</p>` : ''}</div>` : ''}
      ${s.link_url ? `</a>` : ''}
    </div>
  `).join('');
  dotsWrap.innerHTML = slides.map((_, i) => `<button data-dot="${i}" class="${i === 0 ? 'active' : ''}"></button>`).join('');

  function goTo(i) {
    current = (i + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dotsWrap.querySelectorAll('button').forEach((d, idx) => d.classList.toggle('active', idx === current));
  }
  function restartAutoplay() {
    clearInterval(timer);
    if (slides.length > 1) timer = setInterval(() => goTo(current + 1), 5000);
  }

  dotsWrap.querySelectorAll('[data-dot]').forEach(dot => dot.addEventListener('click', () => { goTo(Number(dot.dataset.dot)); restartAutoplay(); }));
  document.getElementById('carouselPrev').addEventListener('click', () => { goTo(current - 1); restartAutoplay(); });
  document.getElementById('carouselNext').addEventListener('click', () => { goTo(current + 1); restartAutoplay(); });
  if (slides.length <= 1) {
    document.getElementById('carouselPrev').hidden = true;
    document.getElementById('carouselNext').hidden = true;
    dotsWrap.hidden = true;
  }

  section.hidden = false;
  restartAutoplay();
}

// ---------------- Scroll-in animations ----------------
function initScrollAnimations() {
  const targets = document.querySelectorAll('[data-animate]');
  if (!('IntersectionObserver' in window) || targets.length === 0) {
    targets.forEach(el => el.classList.add('in-view')); // no-JS/old-browser fallback: just show everything
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  targets.forEach(el => observer.observe(el));
}

(async function init() {
  await loadSiteSettings();
  wireGenericWhatsappButtons();
  await loadCurrentCustomer();
  await loadCategories();
  await loadProducts();
  await loadCarousel();
  renderCartDrawer();
  initScrollAnimations();
})();
