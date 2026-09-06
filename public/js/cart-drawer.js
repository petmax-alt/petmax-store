// ============================================
// Pet Max — Shared cart drawer
// Used on every page EXCEPT the homepage (which has its own full checkout-modal
// integration in main.js). This gives every other page a real, working cart —
// view items with real photos, adjust quantity, remove, and either hand off to
// the homepage's checkout or order the cart directly on WhatsApp.
// ============================================
(function () {
  const fmt = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;

  const SETTINGS = {
    whatsapp_number: '923001234567',
    free_delivery_threshold: 3000,
    shipping_rate_tier1: 190, shipping_rate_tier2: 260, shipping_rate_tier3: 340, shipping_rate_extra_kg: 110,
  };

  function calcShippingFee(weightKg) {
    if (weightKg <= 0.5) return Number(SETTINGS.shipping_rate_tier1);
    if (weightKg <= 1.0) return Number(SETTINGS.shipping_rate_tier2);
    if (weightKg <= 2.0) return Number(SETTINGS.shipping_rate_tier3);
    const extraKg = Math.ceil(weightKg - 2.0);
    return Number(SETTINGS.shipping_rate_tier3) + extraKg * Number(SETTINGS.shipping_rate_extra_kg);
  }

  function ensureDrawerMarkup() {
    if (document.getElementById('cartDrawer')) return;

    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.id = 'overlay';
    document.body.appendChild(overlay);

    const aside = document.createElement('aside');
    aside.className = 'drawer';
    aside.id = 'cartDrawer';
    aside.setAttribute('aria-label', 'Shopping cart');
    aside.innerHTML = `
      <div class="drawer-head">
        <h3>Your cart</h3>
        <button class="drawer-close" id="closeCart" aria-label="Close cart">✕</button>
      </div>
      <div class="drawer-body" id="cartBody"></div>
      <div class="drawer-foot" id="cartFoot" hidden>
        <div id="freeDeliveryNote"></div>
        <div class="summary-row"><span>Subtotal</span><span id="cartSubtotal">Rs 0</span></div>
        <div class="summary-row"><span>Delivery</span><span id="cartDelivery">Rs 0</span></div>
        <div class="summary-row total"><span>Total</span><span id="cartTotal">Rs 0</span></div>
        <button class="btn btn--primary btn--block" id="checkoutBtn">Checkout</button>
        <button class="btn btn--whatsapp btn--block" id="cartWhatsappBtn" style="margin-top:10px;">Order this cart on WhatsApp</button>
      </div>
    `;
    document.body.appendChild(aside);

    document.getElementById('closeCart').addEventListener('click', closeCartDrawer);
    overlay.addEventListener('click', closeCartDrawer);
    document.getElementById('checkoutBtn').addEventListener('click', () => {
      // No checkout flow lives on this page — hand off to the homepage,
      // which auto-opens checkout when it sees this flag.
      location.href = '/?checkout=1';
    });
    document.getElementById('cartWhatsappBtn').addEventListener('click', () => {
      const items = Cart.getItems();
      if (items.length === 0) return;
      const lines = items.map(i => `• ${i.name} x${i.qty} — ${fmt(i.price * i.qty)}`).join('\n');
      const text = `Hi Pet Max! I'd like to order:\n\n${lines}\n\nSubtotal: ${fmt(Cart.subtotal())}`;
      window.open(`https://wa.me/${SETTINGS.whatsapp_number}?text=${encodeURIComponent(text)}`, '_blank');
    });
  }

  function updateCartBadge() {
    const badge = document.getElementById('cartCount');
    if (!badge) return;
    const count = Cart.count();
    badge.hidden = count === 0;
    badge.textContent = count;
  }

  function renderCartDrawer() {
    const items = Cart.getItems();
    const body = document.getElementById('cartBody');
    const foot = document.getElementById('cartFoot');
    updateCartBadge();

    if (items.length === 0) {
      body.innerHTML = `<div class="drawer-empty"><div class="paw"></div><p>Your cart is empty.<br>Add something your cat will love.</p></div>`;
      foot.hidden = true;
      return;
    }

    foot.hidden = false;
    body.innerHTML = items.map((i, idx) => `
      <div class="cart-line" data-line="${idx}">
        <div class="cart-line-thumb accent-${i.accent}">${i.has_image ? `<img src="/api/products/image/${i.id}" alt="${i.name}" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">` : '<span style="font-size:22px;">🐾</span>'}</div>
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
    }));

    const subtotal = Cart.subtotal();
    const threshold = Number(SETTINGS.free_delivery_threshold);
    const delivery = subtotal >= threshold ? 0 : calcShippingFee(Cart.totalWeight());
    document.getElementById('cartSubtotal').textContent = fmt(subtotal);
    document.getElementById('cartDelivery').textContent = delivery === 0 ? 'Free' : fmt(delivery);
    document.getElementById('cartTotal').textContent = fmt(subtotal + delivery);

    const noteEl = document.getElementById('freeDeliveryNote');
    noteEl.innerHTML = subtotal < threshold
      ? `<div class="free-delivery-note"><span class="paw"></span> Add ${fmt(threshold - subtotal)} more for free delivery</div>`
      : `<div class="free-delivery-note"><span class="paw"></span> You've unlocked free delivery!</div>`;
  }

  function openCartDrawer() {
    ensureDrawerMarkup();
    renderCartDrawer();
    document.getElementById('overlay').classList.add('open');
    document.getElementById('cartDrawer').classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeCartDrawer() {
    document.getElementById('overlay').classList.remove('open');
    document.getElementById('cartDrawer').classList.remove('open');
    document.body.style.overflow = '';
  }

  async function loadCartSettings() {
    try {
      const res = await fetch('/api/settings');
      Object.assign(SETTINGS, await res.json());
    } catch (err) {
      // Falls back to the hardcoded defaults above if this fails — cart still works.
    }
  }

  document.addEventListener('DOMContentLoaded', async () => {
    ensureDrawerMarkup();
    await loadCartSettings();
    updateCartBadge();
    const cartBtn = document.getElementById('cartBtn');
    if (cartBtn) cartBtn.addEventListener('click', openCartDrawer);
  });

  document.addEventListener('cart:changed', () => {
    updateCartBadge();
    const drawer = document.getElementById('cartDrawer');
    if (drawer && drawer.classList.contains('open')) renderCartDrawer();
  });
})();
