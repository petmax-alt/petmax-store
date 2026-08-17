// ============================================
// Pet Max — Admin panel logic
// ============================================
const fmt = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;

let PRODUCTS = [];
let ORDERS = [];
let CATEGORIES = [];
let EDITING_PRODUCT_ID = null;
let EXISTING_IMAGES = [];   // [{id}] already on the product, in display order
let REMOVE_IMAGE_IDS = [];  // existing image ids the admin removed this session
let NEW_IMAGE_FILES = [];   // File objects staged for upload, with local preview URLs
let VARIANTS = [];          // [{id?, label, sku, price, compare_price, stock}] — id present only if already saved

function productImageSrc(p) {
  return p.has_image ? `/api/products/image/${p.id}` : null;
}

// ---------------- Rich text editor ----------------
const descriptionEditor = new Quill('#pf_description_editor', {
  theme: 'snow',
  placeholder: 'Tell customers what makes this product great…',
  modules: {
    toolbar: [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], ['link'], ['clean']],
  },
});
// Keep the hidden input in sync so the rest of the form logic doesn't need to know Quill exists
descriptionEditor.on('text-change', () => {
  document.getElementById('pf_description').value = descriptionEditor.root.innerHTML;
});

// ---------------- Multi-photo gallery ----------------
const dropzone = document.getElementById('imageDropzone');
const fileInput = document.getElementById('pf_image');
const galleryGrid = document.getElementById('imageGalleryGrid');

function renderGallery() {
  const existingThumbs = EXISTING_IMAGES
    .filter(img => !REMOVE_IMAGE_IDS.includes(img.id))
    .map((img, i) => `
      <div class="gallery-thumb ${i === 0 && NEW_IMAGE_FILES.length === 0 ? 'cover' : ''}" draggable="true" data-existing-id="${img.id}">
        <img src="/api/products/images/${img.id}" alt="Product photo">
        <button type="button" class="thumb-remove" data-remove-existing="${img.id}">✕</button>
      </div>
    `).join('');

  const newThumbs = NEW_IMAGE_FILES.map((file, i) => `
    <div class="gallery-thumb ${i === 0 && EXISTING_IMAGES.filter(img => !REMOVE_IMAGE_IDS.includes(img.id)).length === 0 ? 'cover' : ''}" data-new-index="${i}">
      <img src="${file.previewUrl}" alt="New photo">
      <button type="button" class="thumb-remove" data-remove-new="${i}">✕</button>
    </div>
  `).join('');

  galleryGrid.innerHTML = existingThumbs + newThumbs;

  galleryGrid.querySelectorAll('[data-remove-existing]').forEach(btn => {
    btn.addEventListener('click', () => {
      REMOVE_IMAGE_IDS.push(Number(btn.dataset.removeExisting));
      renderGallery();
    });
  });
  galleryGrid.querySelectorAll('[data-remove-new]').forEach(btn => {
    btn.addEventListener('click', () => {
      NEW_IMAGE_FILES.splice(Number(btn.dataset.removeNew), 1);
      renderGallery();
    });
  });

  // Drag-to-reorder among existing (already-saved) images
  let dragId = null;
  galleryGrid.querySelectorAll('[data-existing-id]').forEach(thumb => {
    thumb.addEventListener('dragstart', () => { dragId = Number(thumb.dataset.existingId); });
    thumb.addEventListener('dragover', (e) => { e.preventDefault(); thumb.classList.add('drag-over'); });
    thumb.addEventListener('dragleave', () => thumb.classList.remove('drag-over'));
    thumb.addEventListener('drop', async (e) => {
      e.preventDefault();
      thumb.classList.remove('drag-over');
      const targetId = Number(thumb.dataset.existingId);
      if (dragId === null || dragId === targetId) return;
      const order = EXISTING_IMAGES.map(img => img.id);
      const fromIdx = order.indexOf(dragId);
      const toIdx = order.indexOf(targetId);
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, dragId);
      EXISTING_IMAGES = order.map(id => ({ id }));
      renderGallery();
      if (EDITING_PRODUCT_ID) {
        await fetch(`/api/products/${EDITING_PRODUCT_ID}/images/order`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ order }),
        });
      }
    });
  });
}

function addNewImageFiles(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    if (EXISTING_IMAGES.length - REMOVE_IMAGE_IDS.length + NEW_IMAGE_FILES.length >= 6) break;
    file.previewUrl = URL.createObjectURL(file);
    NEW_IMAGE_FILES.push(file);
  }
  renderGallery();
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => { addNewImageFiles([...fileInput.files]); fileInput.value = ''; });
['dragover', 'dragenter'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
);
dropzone.addEventListener('drop', (e) => addNewImageFiles([...e.dataTransfer.files]));

// ---------------- Variants editor ----------------
function renderVariants() {
  const list = document.getElementById('variantsList');
  if (VARIANTS.length === 0) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = `
    <div class="variant-row-labels"><span>Label</span><span>SKU</span><span>Price</span><span>Compare</span><span>Stock</span><span></span></div>
    ${VARIANTS.map((v, i) => `
      <div class="variant-row" data-variant-idx="${i}">
        <input type="text" placeholder="e.g. Small — Chicken" value="${v.label || ''}" data-vfield="label">
        <input type="text" placeholder="SKU" value="${v.sku || ''}" data-vfield="sku">
        <input type="number" min="0" placeholder="Price" value="${v.price ?? ''}" data-vfield="price">
        <input type="number" min="0" placeholder="Compare" value="${v.compare_price ?? ''}" data-vfield="compare_price">
        <input type="number" min="0" placeholder="Stock" value="${v.stock ?? ''}" data-vfield="stock">
        <button type="button" data-remove-variant="${i}">✕</button>
      </div>
    `).join('')}
  `;
  list.querySelectorAll('[data-variant-idx]').forEach(row => {
    const idx = Number(row.dataset.variantIdx);
    row.querySelectorAll('[data-vfield]').forEach(input => {
      input.addEventListener('input', () => { VARIANTS[idx][input.dataset.vfield] = input.value; });
    });
  });
  list.querySelectorAll('[data-remove-variant]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = Number(btn.dataset.removeVariant);
      const variant = VARIANTS[idx];
      if (variant.id && EDITING_PRODUCT_ID) {
        await fetch(`/api/products/${EDITING_PRODUCT_ID}/variants/${variant.id}`, { method: 'DELETE' });
      }
      VARIANTS.splice(idx, 1);
      renderVariants();
    });
  });
}

document.getElementById('addVariantBtn').addEventListener('click', () => {
  VARIANTS.push({ label: '', sku: '', price: '', compare_price: '', stock: '' });
  renderVariants();
});

function toast(msg, isError) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.toggle('toast--error', !!isError);
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2400);
}

// ---------------- Auth ----------------
async function checkAuth() {
  const res = await fetch('/api/auth/status');
  const data = await res.json();
  if (data.isAdmin) {
    showAdmin();
  } else {
    document.getElementById('loginScreen').hidden = false;
    document.getElementById('adminShell').hidden = true;
  }
}

document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('loginPassword').value;
  const errorEl = document.getElementById('loginError');
  errorEl.style.display = 'none';
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    showAdmin();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  }
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  location.reload();
});

function showAdmin() {
  document.getElementById('loginScreen').hidden = true;
  document.getElementById('adminShell').hidden = false;
  loadAll();
}

// ---------------- Nav ----------------
const ALL_VIEWS = ['dashboard', 'orders', 'products', 'categories', 'inventory', 'customers', 'coupons', 'analytics', 'blog', 'settings', 'users'];

document.querySelectorAll('.admin-nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav-item[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ALL_VIEWS.forEach(v => {
      document.getElementById(`view-${v}`).hidden = v !== btn.dataset.view;
    });
    if (btn.dataset.view === 'categories') renderCategoriesTable();
    if (btn.dataset.view === 'inventory') renderInventoryTable();
    if (btn.dataset.view === 'customers') { renderCustomersTable(); renderRegisteredCustomersTable(); }
    if (btn.dataset.view === 'blog') renderBlogTable();
  });
});

// ---------------- Load data ----------------
async function loadAll() {
  await Promise.all([loadProducts(), loadOrders(), loadCategories()]);
  renderDashboard();
  renderProductsTable();
  renderOrdersTable();
  populateCategoryDropdown();
  loadSettingsForm();
}

async function loadProducts() {
  const res = await fetch('/api/products');
  PRODUCTS = await res.json();
}

async function loadOrders() {
  const res = await fetch('/api/orders');
  if (res.status === 401) return (ORDERS = []);
  ORDERS = await res.json();
}

async function loadCategories() {
  const res = await fetch('/api/categories');
  CATEGORIES = await res.json();
}

function populateCategoryDropdown() {
  const select = document.getElementById('pf_category');
  if (!select) return;
  const current = select.value;
  select.innerHTML = CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
  if (current) select.value = current;
}

// ---------------- Dashboard ----------------
let revenueChartInstance = null;
let statusChartInstance = null;

function renderDashboard() {
  const totalRevenue = ORDERS.reduce((s, o) => s + o.total, 0);
  const pendingOrders = ORDERS.filter(o => o.status === 'new').length;
  const lowStock = PRODUCTS.filter(p => p.stock > 0 && p.stock <= 5).length;

  document.getElementById('statRow').innerHTML = `
    <div class="stat-card"><div class="stat-card-text"><span>Total orders</span><b>${ORDERS.length}</b></div><div class="stat-card-icon">📦</div></div>
    <div class="stat-card"><div class="stat-card-text"><span>Revenue</span><b>${fmt(totalRevenue)}</b></div><div class="stat-card-icon icon-green">💰</div></div>
    <div class="stat-card"><div class="stat-card-text"><span>New / pending</span><b>${pendingOrders}</b></div><div class="stat-card-icon icon-navy">⏳</div></div>
    <div class="stat-card"><div class="stat-card-text"><span>Low stock items</span><b>${lowStock}</b></div><div class="stat-card-icon icon-red">⚠️</div></div>
  `;

  const tbody = document.querySelector('#recentOrdersTable tbody');
  tbody.innerHTML = ORDERS.slice(0, 6).map(o => `
    <tr>
      <td><b>${o.order_code}</b></td>
      <td>${o.customer_name}</td>
      <td>${paymentPill(o)}</td>
      <td>${fmt(o.total)}</td>
      <td>${statusPill(o.status)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center; color:var(--ink-soft); padding:30px;">No orders yet</td></tr>`;

  renderRevenueChart();
  renderStatusChart();
}

function renderRevenueChart() {
  const days = [];
  const totals = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push(d.toLocaleDateString('en-PK', { day: 'numeric', month: 'short' }));
    const dayTotal = ORDERS
      .filter(o => (o.created_at || '').slice(0, 10) === key)
      .reduce((s, o) => s + o.total, 0);
    totals.push(dayTotal);
  }

  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;
  if (revenueChartInstance) revenueChartInstance.destroy();
  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: days,
      datasets: [{
        label: 'Revenue',
        data: totals,
        borderColor: '#F4622E',
        backgroundColor: 'rgba(244, 98, 46, 0.1)',
        fill: true,
        tension: 0.35,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { callback: v => 'Rs ' + v } } },
    },
  });
}

function renderStatusChart() {
  const labels = ['new', 'processing', 'shipped', 'delivered', 'cancelled'];
  const colors = ['#F2A93B', '#294061', '#F4622E', '#25D366', '#C23B3B'];
  const counts = labels.map(s => ORDERS.filter(o => o.status === s).length);

  const ctx = document.getElementById('statusChart');
  if (!ctx) return;
  if (statusChartInstance) statusChartInstance.destroy();
  statusChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels.map(s => s[0].toUpperCase() + s.slice(1)),
      datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0 }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } } },
    },
  });
}

// ---------------- Categories ----------------
function renderCategoriesTable() {
  const tbody = document.getElementById('categoriesTableBody');
  tbody.innerHTML = CATEGORIES.map(c => `
    <tr>
      <td><b>${c.name}</b></td>
      <td>${c.slug}</td>
      <td>${c.product_count}</td>
      <td class="row-actions">
        <button class="danger" data-delete-cat="${c.id}" ${c.product_count > 0 ? 'disabled title="Move products out of this category first"' : ''}>Delete</button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="4" style="text-align:center; color:var(--ink-soft); padding:30px;">No categories yet</td></tr>`;

  tbody.querySelectorAll('[data-delete-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this category?')) return;
      const res = await fetch(`/api/categories/${btn.dataset.deleteCat}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) return toast(data.error, true);
      await loadCategories();
      renderCategoriesTable();
      populateCategoryDropdown();
      toast('Category deleted');
    });
  });
}

document.getElementById('addCategoryBtn').addEventListener('click', async () => {
  const name = prompt('New category name:');
  if (!name || !name.trim()) return;
  const res = await fetch('/api/categories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: name.trim() }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error, true);
  await loadCategories();
  renderCategoriesTable();
  populateCategoryDropdown();
  toast('Category added');
});

// ---------------- Inventory ----------------
function renderInventoryTable() {
  const tbody = document.getElementById('inventoryTableBody');
  tbody.innerHTML = PRODUCTS.map(p => {
    let badge = `<span class="stock-badge pill-green">In stock</span>`;
    if (p.stock === 0) badge = `<span class="stock-badge pill-red">Out of stock</span>`;
    else if (p.stock <= 5) badge = `<span class="stock-badge pill-orange">Low stock</span>`;
    return `
      <tr>
        <td><div class="admin-thumb">${productImageSrc(p) ? `<img src="${productImageSrc(p)}" alt="${p.name}">` : getProductIcon(p.icon, p.accent)}</div></td>
        <td><b>${p.name}</b></td>
        <td>${p.category}</td>
        <td>${p.stock}</td>
        <td>${badge}</td>
        <td class="stock-adjust">
          ${p.has_variants
            ? `<span style="font-size:0.78rem; color:var(--ink-soft);">Edit product to adjust</span>`
            : `<button data-stock-adjust="${p.id}" data-delta="-1">−</button>
               <span>${p.stock}</span>
               <button data-stock-adjust="${p.id}" data-delta="1">+</button>`
          }
        </td>
      </tr>
    `;
  }).join('') || `<tr><td colspan="6" style="text-align:center; color:var(--ink-soft); padding:30px;">No products yet</td></tr>`;

  tbody.querySelectorAll('[data-stock-adjust]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.stockAdjust;
      const delta = Number(btn.dataset.delta);
      const res = await fetch(`/api/products/${id}/stock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delta }),
      });
      if (!res.ok) return;
      await loadProducts();
      renderInventoryTable();
      renderDashboard();
    });
  });
}

async function renderRegisteredCustomersTable() {
  const res = await fetch('/api/customers');
  const customers = await res.json();
  document.getElementById('registeredCustomersTableBody').innerHTML = customers.map(c => `
    <tr>
      <td><b>${c.name}</b></td>
      <td>${c.email}</td>
      <td>${c.phone || '—'}</td>
      <td>${new Date(c.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
      <td>${c.order_count}</td>
      <td>${fmt(c.total_spent)}</td>
    </tr>
  `).join('') || `<tr><td colspan="6" style="text-align:center; color:var(--ink-soft); padding:30px;">No registered accounts yet</td></tr>`;
}

// ---------------- Customers (derived from orders — full accounts coming later) ----------------
function renderCustomersTable() {
  const byPhone = {};
  for (const o of ORDERS) {
    if (!byPhone[o.phone]) byPhone[o.phone] = { name: o.customer_name, phone: o.phone, city: o.city, orders: 0, total: 0 };
    byPhone[o.phone].orders += 1;
    byPhone[o.phone].total += o.total;
  }
  const customers = Object.values(byPhone).sort((a, b) => b.total - a.total);

  document.getElementById('customersTableBody').innerHTML = customers.map(c => `
    <tr>
      <td><b>${c.name}</b></td>
      <td>${c.phone}</td>
      <td>${c.city}</td>
      <td>${c.orders}</td>
      <td>${fmt(c.total)}</td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center; color:var(--ink-soft); padding:30px;">No customers yet</td></tr>`;
}

// ---------------- Store Settings ----------------
async function loadSettingsForm() {
  const res = await fetch('/api/settings');
  const s = await res.json();
  document.getElementById('st_whatsapp').value = s.whatsapp_number || '';
  document.getElementById('st_delivery_fee').value = s.delivery_fee || '';
  document.getElementById('st_free_delivery_threshold').value = s.free_delivery_threshold || '';
  document.getElementById('st_currency').value = s.currency_symbol || '';
  document.getElementById('st_bank_title').value = s.bank_account_title || '';
  document.getElementById('st_jazzcash').value = s.bank_jazzcash || '';
  document.getElementById('st_easypaisa').value = s.bank_easypaisa || '';
  document.getElementById('st_bank_name').value = s.bank_name || '';
  document.getElementById('st_bank_account').value = s.bank_account || '';
  document.getElementById('st_iban').value = s.bank_iban || '';
  document.getElementById('st_hero_heading').value = s.hero_heading || '';
  document.getElementById('st_hero_subheading').value = s.hero_subheading || '';
  document.getElementById('st_hero_cta').value = s.hero_cta_text || '';
  document.getElementById('st_banner_text').value = s.banner_text || '';
  document.getElementById('st_banner_link').value = s.banner_link || '';
}

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('settingsSaveBtn');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const res = await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        whatsapp_number: document.getElementById('st_whatsapp').value.trim(),
        delivery_fee: document.getElementById('st_delivery_fee').value,
        free_delivery_threshold: document.getElementById('st_free_delivery_threshold').value,
        currency_symbol: document.getElementById('st_currency').value.trim(),
        bank_account_title: document.getElementById('st_bank_title').value.trim(),
        bank_jazzcash: document.getElementById('st_jazzcash').value.trim(),
        bank_easypaisa: document.getElementById('st_easypaisa').value.trim(),
        bank_name: document.getElementById('st_bank_name').value.trim(),
        bank_account: document.getElementById('st_bank_account').value.trim(),
        bank_iban: document.getElementById('st_iban').value.trim(),
        hero_heading: document.getElementById('st_hero_heading').value.trim(),
        hero_subheading: document.getElementById('st_hero_subheading').value.trim(),
        hero_cta_text: document.getElementById('st_hero_cta').value.trim(),
        banner_text: document.getElementById('st_banner_text').value.trim(),
        banner_link: document.getElementById('st_banner_link').value.trim(),
      }),
    });
    if (!res.ok) throw new Error('Could not save settings');
    toast('Settings saved');
  } catch (err) {
    toast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save settings';
  }
});

function paymentPill(o) {
  if (o.payment_method === 'cod') return `<span class="pill pill-gray">COD</span>`;
  if (o.payment_status === 'verified') return `<span class="pill pill-green">Online · Verified</span>`;
  return `<span class="pill pill-orange">Online · Pending</span>`;
}

function statusPill(status) {
  const map = {
    new: 'pill-orange',
    processing: 'pill-orange',
    shipped: 'pill-gray',
    delivered: 'pill-green',
    cancelled: 'pill-red',
  };
  return `<span class="pill ${map[status] || 'pill-gray'}" style="text-transform:capitalize;">${status}</span>`;
}

// ---------------- Products table ----------------
let SELECTED_PRODUCT_IDS = new Set();

function renderProductsTable() {
  const tbody = document.getElementById('productsTableBody');
  tbody.innerHTML = PRODUCTS.map(p => `
    <tr>
      <td><input type="checkbox" class="product-select-cb" data-select="${p.id}" ${SELECTED_PRODUCT_IDS.has(p.id) ? 'checked' : ''}></td>
      <td><div class="admin-thumb">${productImageSrc(p) ? `<img src="${productImageSrc(p)}" alt="${p.name}">` : getProductIcon(p.icon, p.accent)}</div></td>
      <td><b>${p.name}</b>${p.has_variants ? ` <span class="pill pill-gray" style="margin-left:6px;">${p.variant_count} variants</span>` : ''}</td>
      <td>${p.category}</td>
      <td>${p.has_variants ? `${fmt(p.price_range.min)}${p.price_range.min !== p.price_range.max ? '–' + fmt(p.price_range.max) : ''}` : fmt(p.price)}</td>
      <td>${p.stock <= 0 ? '<span class="pill pill-red">Out</span>' : p.stock <= 5 ? `<span class="pill pill-orange">${p.stock} left</span>` : p.stock}</td>
      <td>${p.badge ? `<span class="pill pill-gray">${p.badge}</span>` : '—'}</td>
      <td>
        <div class="row-actions">
          <button data-edit="${p.id}">Edit</button>
          <button class="danger" data-delete="${p.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="8" style="text-align:center; color:var(--ink-soft); padding:30px;">No products yet</td></tr>`;

  tbody.querySelectorAll('[data-select]').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = Number(cb.dataset.select);
      if (cb.checked) SELECTED_PRODUCT_IDS.add(id); else SELECTED_PRODUCT_IDS.delete(id);
      updateBulkBar();
    });
  });

  tbody.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => openProductForm(Number(el.dataset.edit))));
  tbody.querySelectorAll('[data-delete]').forEach(el => el.addEventListener('click', () => deleteProduct(Number(el.dataset.delete))));
}

document.getElementById('addProductBtn').addEventListener('click', () => openProductForm(null));

async function openProductForm(id) {
  EDITING_PRODUCT_ID = id;
  const modal = document.getElementById('productModal');
  const errorEl = document.getElementById('productFormError');
  errorEl.style.display = 'none';
  document.getElementById('productForm').reset();
  descriptionEditor.setContents([]);
  EXISTING_IMAGES = [];
  REMOVE_IMAGE_IDS = [];
  NEW_IMAGE_FILES = [];
  VARIANTS = [];
  renderGallery();
  renderVariants();

  if (id) {
    document.getElementById('productModalTitle').textContent = 'Edit product';
    // Fetch full detail — the list view only has aggregate data, not individual images/variants.
    const listVersion = PRODUCTS.find(x => x.id === id);
    const res = await fetch(`/api/products/${listVersion.slug}`);
    const p = await res.json();

    document.getElementById('pf_name').value = p.name;
    document.getElementById('pf_category').value = p.category;
    document.getElementById('pf_icon').value = p.icon;
    document.getElementById('pf_price').value = p.price;
    document.getElementById('pf_compare').value = p.compare_price || '';
    document.getElementById('pf_stock').value = p.stock;
    document.getElementById('pf_badge').value = p.badge || '';
    document.getElementById('pf_accent').value = p.accent;
    document.getElementById('pf_sku').value = p.sku || '';
    if (p.description) descriptionEditor.root.innerHTML = p.description;
    document.getElementById('pf_description').value = p.description || '';

    EXISTING_IMAGES = p.images || [];
    VARIANTS = (p.variants || []).map(v => ({ ...v }));
    renderGallery();
    renderVariants();
  } else {
    document.getElementById('productModalTitle').textContent = 'Add product';
  }
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

document.querySelectorAll('[data-close-modal]').forEach(el => {
  el.addEventListener('click', () => {
    el.closest('.modal').classList.remove('open');
    document.body.style.overflow = '';
  });
});

document.getElementById('productForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('productFormError');
  errorEl.style.display = 'none';

  const formData = new FormData();
  formData.append('name', document.getElementById('pf_name').value.trim());
  formData.append('category', document.getElementById('pf_category').value);
  formData.append('icon', document.getElementById('pf_icon').value);
  formData.append('price', document.getElementById('pf_price').value);
  formData.append('compare_price', document.getElementById('pf_compare').value || '');
  formData.append('stock', document.getElementById('pf_stock').value);
  formData.append('badge', document.getElementById('pf_badge').value);
  formData.append('accent', document.getElementById('pf_accent').value);
  formData.append('sku', document.getElementById('pf_sku').value.trim());
  formData.append('description', document.getElementById('pf_description').value.trim());
  NEW_IMAGE_FILES.forEach(file => formData.append('images', file));
  if (REMOVE_IMAGE_IDS.length) formData.append('remove_image_ids', JSON.stringify(REMOVE_IMAGE_IDS));

  const saveBtn = document.getElementById('productSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const url = EDITING_PRODUCT_ID ? `/api/products/${EDITING_PRODUCT_ID}` : '/api/products';
    const method = EDITING_PRODUCT_ID ? 'PUT' : 'POST';
    // No Content-Type header here on purpose — the browser sets the multipart
    // boundary itself when the body is a FormData object.
    const res = await fetch(url, { method, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save product');

    const productId = data.id;

    // Sync variants: update ones that already have an id, create ones that don't.
    // (Deletions already happened immediately when the ✕ was clicked, in renderVariants.)
    for (const v of VARIANTS) {
      if (!v.label || v.price === '' || v.price === undefined) continue; // skip incomplete rows
      const body = JSON.stringify({
        label: v.label, sku: v.sku || '', price: Number(v.price),
        compare_price: v.compare_price === '' ? '' : Number(v.compare_price),
        stock: Number(v.stock) || 0,
      });
      if (v.id) {
        await fetch(`/api/products/${productId}/variants/${v.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body });
      } else {
        await fetch(`/api/products/${productId}/variants`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      }
    }

    document.getElementById('productModal').classList.remove('open');
    document.body.style.overflow = '';
    toast(EDITING_PRODUCT_ID ? 'Product updated' : 'Product added');
    await loadProducts();
    renderProductsTable();
    renderDashboard();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save product';
  }
});

async function deleteProduct(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!confirm(`Delete "${p.name}"? This can't be undone.`)) return;
  const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
  if (!res.ok) return toast('Could not delete product');
  toast('Product deleted');
  await loadProducts();
  renderProductsTable();
  renderDashboard();
}

// ---------------- Bulk actions ----------------
function updateBulkBar() {
  const bar = document.getElementById('bulkActionBar');
  const count = SELECTED_PRODUCT_IDS.size;
  bar.hidden = count === 0;
  document.getElementById('bulkSelectedCount').textContent = `${count} selected`;

  const catSelect = document.getElementById('bulkCategorySelect');
  catSelect.innerHTML = `<option value="">Move to category…</option>` + CATEGORIES.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  const selectAll = document.getElementById('selectAllProducts');
  selectAll.checked = count > 0 && count === PRODUCTS.length;
  selectAll.indeterminate = count > 0 && count < PRODUCTS.length;
}

document.getElementById('selectAllProducts').addEventListener('change', (e) => {
  SELECTED_PRODUCT_IDS = e.target.checked ? new Set(PRODUCTS.map(p => p.id)) : new Set();
  renderProductsTable();
  updateBulkBar();
});

document.getElementById('bulkClearBtn').addEventListener('click', () => {
  SELECTED_PRODUCT_IDS = new Set();
  renderProductsTable();
  updateBulkBar();
});

document.getElementById('bulkDeleteBtn').addEventListener('click', async () => {
  const ids = [...SELECTED_PRODUCT_IDS];
  if (ids.length === 0) return;
  if (!confirm(`Delete ${ids.length} product(s)? This can't be undone.`)) return;
  const res = await fetch('/api/products/bulk-delete', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error, true);
  toast(`${data.deleted} product(s) deleted`);
  SELECTED_PRODUCT_IDS = new Set();
  await loadProducts();
  renderProductsTable();
  renderDashboard();
  updateBulkBar();
});

document.getElementById('bulkCategorySelect').addEventListener('change', async (e) => {
  const category = e.target.value;
  if (!category) return;
  const ids = [...SELECTED_PRODUCT_IDS];
  const res = await fetch('/api/products/bulk-category', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, category }),
  });
  const data = await res.json();
  if (!res.ok) return toast(data.error, true);
  toast(`${data.updated} product(s) moved to ${category}`);
  SELECTED_PRODUCT_IDS = new Set();
  e.target.value = '';
  await loadProducts();
  renderProductsTable();
  updateBulkBar();
});

// ---------------- Orders table ----------------
function renderOrdersTable() {
  const tbody = document.getElementById('ordersTableBody');
  tbody.innerHTML = ORDERS.map(o => `
    <tr>
      <td><b>${o.order_code}</b></td>
      <td>${o.customer_name}<br><span style="color:var(--ink-soft); font-size:0.78rem;">${o.phone}</span></td>
      <td style="max-width:220px;">${o.items.map(i => `${i.name} ×${i.qty}`).join(', ')}</td>
      <td>${paymentPill(o)}${o.payment_method === 'online' && o.transaction_id ? `<div style="font-size:0.72rem; color:var(--ink-soft); margin-top:4px;">Ref: ${o.transaction_id}</div>` : ''}</td>
      <td>${fmt(o.total)}</td>
      <td>
        <select class="status-select" data-order-status="${o.id}">
          ${['new', 'processing', 'shipped', 'delivered', 'cancelled'].map(s => `<option value="${s}" ${o.status === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
        </select>
      </td>
      <td style="font-size:0.78rem; color:var(--ink-soft);">${new Date(o.created_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}</td>
    </tr>
  `).join('') || `<tr><td colspan="7" style="text-align:center; color:var(--ink-soft); padding:30px;">No orders yet</td></tr>`;

  tbody.querySelectorAll('[data-order-status]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const id = Number(sel.dataset.orderStatus);
      const res = await fetch(`/api/orders/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: sel.value }),
      });
      if (res.ok) {
        toast('Order status updated');
        await loadOrders();
        renderDashboard();
      }
    });
  });
}

// ---------------- Blog ----------------
let BLOG_POSTS = [];
let EDITING_POST_ID = null;
let BLOG_COVER_FILE = null;
let BLOG_REMOVE_COVER = false;

const blogContentEditor = new Quill('#bf_content_editor', {
  theme: 'snow',
  placeholder: 'Write your post…',
  modules: {
    toolbar: [
      [{ header: [2, 3, false] }],
      ['bold', 'italic', 'underline'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      ['link'], ['clean'],
    ],
  },
});
blogContentEditor.on('text-change', () => {
  document.getElementById('bf_content').value = blogContentEditor.root.innerHTML;
});

async function renderBlogTable() {
  const res = await fetch('/api/blog/admin');
  BLOG_POSTS = await res.json();
  document.getElementById('blogTableBody').innerHTML = BLOG_POSTS.map(p => `
    <tr>
      <td><div class="admin-thumb">${p.has_cover_image ? `<img src="/api/blog/image/${p.id}" alt="${p.title}">` : '📝'}</div></td>
      <td><b>${p.title}</b></td>
      <td>${p.status === 'published' ? '<span class="pill pill-green">Published</span>' : '<span class="pill pill-gray">Draft</span>'}</td>
      <td>${p.published_at ? new Date(p.published_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</td>
      <td>
        <div class="row-actions">
          <button data-edit-post="${p.id}">Edit</button>
          <button class="danger" data-delete-post="${p.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="5" style="text-align:center; color:var(--ink-soft); padding:30px;">No posts yet — click "New post" to write your first one.</td></tr>`;

  document.querySelectorAll('[data-edit-post]').forEach(btn => btn.addEventListener('click', () => openBlogForm(Number(btn.dataset.editPost))));
  document.querySelectorAll('[data-delete-post]').forEach(btn => btn.addEventListener('click', async () => {
    const post = BLOG_POSTS.find(p => p.id === Number(btn.dataset.deletePost));
    if (!confirm(`Delete "${post.title}"? This can't be undone.`)) return;
    const res = await fetch(`/api/blog/${post.id}`, { method: 'DELETE' });
    if (!res.ok) return toast('Could not delete post', true);
    toast('Post deleted');
    renderBlogTable();
  }));
}

function openBlogForm(id) {
  EDITING_POST_ID = id;
  document.getElementById('blogForm').reset();
  blogContentEditor.setContents([]);
  BLOG_COVER_FILE = null;
  BLOG_REMOVE_COVER = false;
  document.getElementById('blogDropzoneEmpty').hidden = false;
  document.getElementById('blogDropzonePreview').hidden = true;
  document.getElementById('blogFormError').style.display = 'none';

  if (id) {
    const p = BLOG_POSTS.find(x => x.id === id);
    document.getElementById('blogModalTitle').textContent = 'Edit post';
    document.getElementById('bf_title').value = p.title;
    document.getElementById('bf_excerpt').value = p.excerpt || '';
    document.getElementById('bf_status').value = p.status;
    if (p.content) blogContentEditor.root.innerHTML = p.content;
    document.getElementById('bf_content').value = p.content || '';
    if (p.has_cover_image) {
      document.getElementById('blogPreviewImg').src = `/api/blog/image/${p.id}`;
      document.getElementById('blogDropzoneEmpty').hidden = true;
      document.getElementById('blogDropzonePreview').hidden = false;
    }
  } else {
    document.getElementById('blogModalTitle').textContent = 'New post';
  }
  document.getElementById('blogModal').classList.add('open');
  document.body.style.overflow = 'hidden';
}

document.getElementById('addPostBtn').addEventListener('click', () => openBlogForm(null));

const blogDropzone = document.getElementById('blogDropzone');
const blogFileInput = document.getElementById('bf_cover');
blogDropzone.addEventListener('click', () => blogFileInput.click());
function handleBlogCoverFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  BLOG_COVER_FILE = file;
  BLOG_REMOVE_COVER = false;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('blogPreviewImg').src = e.target.result;
    document.getElementById('blogDropzoneEmpty').hidden = true;
    document.getElementById('blogDropzonePreview').hidden = false;
  };
  reader.readAsDataURL(file);
}
blogFileInput.addEventListener('change', () => handleBlogCoverFile(blogFileInput.files[0]));
['dragover', 'dragenter'].forEach(evt => blogDropzone.addEventListener(evt, (e) => { e.preventDefault(); blogDropzone.classList.add('dragover'); }));
['dragleave', 'drop'].forEach(evt => blogDropzone.addEventListener(evt, (e) => { e.preventDefault(); blogDropzone.classList.remove('dragover'); }));
blogDropzone.addEventListener('drop', (e) => { const f = e.dataTransfer.files[0]; if (f) handleBlogCoverFile(f); });
document.getElementById('blogImageRemoveBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  BLOG_COVER_FILE = null;
  BLOG_REMOVE_COVER = true;
  blogFileInput.value = '';
  document.getElementById('blogDropzoneEmpty').hidden = false;
  document.getElementById('blogDropzonePreview').hidden = true;
});

document.getElementById('blogForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorEl = document.getElementById('blogFormError');
  errorEl.style.display = 'none';

  const formData = new FormData();
  formData.append('title', document.getElementById('bf_title').value.trim());
  formData.append('excerpt', document.getElementById('bf_excerpt').value.trim());
  formData.append('content', document.getElementById('bf_content').value);
  formData.append('status', document.getElementById('bf_status').value);
  if (BLOG_COVER_FILE) formData.append('cover_image', BLOG_COVER_FILE);

  const saveBtn = document.getElementById('blogSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';
  try {
    const url = EDITING_POST_ID ? `/api/blog/${EDITING_POST_ID}` : '/api/blog';
    const method = EDITING_POST_ID ? 'PUT' : 'POST';
    const res = await fetch(url, { method, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not save post');
    document.getElementById('blogModal').classList.remove('open');
    document.body.style.overflow = '';
    toast(EDITING_POST_ID ? 'Post updated' : 'Post created');
    renderBlogTable();
  } catch (err) {
    errorEl.textContent = err.message;
    errorEl.style.display = 'block';
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save post';
  }
});

checkAuth();
