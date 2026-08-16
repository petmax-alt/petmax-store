// ============================================
// Pet Max — Admin panel logic
// ============================================
const fmt = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;

let PRODUCTS = [];
let ORDERS = [];
let CATEGORIES = [];
let EDITING_PRODUCT_ID = null;
let SELECTED_IMAGE_FILE = null; // holds a new upload until the form is saved
let REMOVE_IMAGE = false;

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

// ---------------- Image dropzone ----------------
const dropzone = document.getElementById('imageDropzone');
const dropzoneEmpty = document.getElementById('imageDropzoneEmpty');
const dropzonePreview = document.getElementById('imageDropzonePreview');
const previewImg = document.getElementById('imagePreviewImg');
const fileInput = document.getElementById('pf_image');

function showImagePreview(src) {
  previewImg.src = src;
  dropzoneEmpty.hidden = true;
  dropzonePreview.hidden = false;
}
function clearImagePreview() {
  previewImg.src = '';
  dropzoneEmpty.hidden = false;
  dropzonePreview.hidden = true;
}
function handleImageFile(file) {
  if (!file || !file.type.startsWith('image/')) return;
  SELECTED_IMAGE_FILE = file;
  REMOVE_IMAGE = false;
  const reader = new FileReader();
  reader.onload = (e) => showImagePreview(e.target.result);
  reader.readAsDataURL(file);
}

dropzone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => handleImageFile(fileInput.files[0]));

['dragover', 'dragenter'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('dragover'); })
);
['dragleave', 'drop'].forEach(evt =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove('dragover'); })
);
dropzone.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files[0];
  if (file) handleImageFile(file);
});

document.getElementById('imageRemoveBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  SELECTED_IMAGE_FILE = null;
  REMOVE_IMAGE = true;
  fileInput.value = '';
  clearImagePreview();
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
const ALL_VIEWS = ['dashboard', 'orders', 'products', 'categories', 'inventory', 'customers', 'coupons', 'analytics', 'settings', 'users'];

document.querySelectorAll('.admin-nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav-item[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ALL_VIEWS.forEach(v => {
      document.getElementById(`view-${v}`).hidden = v !== btn.dataset.view;
    });
    if (btn.dataset.view === 'categories') renderCategoriesTable();
    if (btn.dataset.view === 'inventory') renderInventoryTable();
    if (btn.dataset.view === 'customers') renderCustomersTable();
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
          <button data-stock-adjust="${p.id}" data-delta="-1">−</button>
          <span>${p.stock}</span>
          <button data-stock-adjust="${p.id}" data-delta="1">+</button>
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
function renderProductsTable() {
  const tbody = document.getElementById('productsTableBody');
  tbody.innerHTML = PRODUCTS.map(p => `
    <tr>
      <td><div class="admin-thumb">${productImageSrc(p) ? `<img src="${productImageSrc(p)}" alt="${p.name}">` : getProductIcon(p.icon, p.accent)}</div></td>
      <td><b>${p.name}</b></td>
      <td>${p.category}</td>
      <td>${fmt(p.price)}</td>
      <td>${p.stock <= 0 ? '<span class="pill pill-red">Out</span>' : p.stock <= 5 ? `<span class="pill pill-orange">${p.stock} left</span>` : p.stock}</td>
      <td>${p.badge ? `<span class="pill pill-gray">${p.badge}</span>` : '—'}</td>
      <td>
        <div class="row-actions">
          <button data-edit="${p.id}">Edit</button>
          <button class="danger" data-delete="${p.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="7" style="text-align:center; color:var(--ink-soft); padding:30px;">No products yet</td></tr>`;

  tbody.querySelectorAll('[data-edit]').forEach(el => el.addEventListener('click', () => openProductForm(Number(el.dataset.edit))));
  tbody.querySelectorAll('[data-delete]').forEach(el => el.addEventListener('click', () => deleteProduct(Number(el.dataset.delete))));
}

document.getElementById('addProductBtn').addEventListener('click', () => openProductForm(null));

function openProductForm(id) {
  EDITING_PRODUCT_ID = id;
  const modal = document.getElementById('productModal');
  const errorEl = document.getElementById('productFormError');
  errorEl.style.display = 'none';
  document.getElementById('productForm').reset();
  descriptionEditor.setContents([]);
  SELECTED_IMAGE_FILE = null;
  REMOVE_IMAGE = false;
  clearImagePreview();

  if (id) {
    const p = PRODUCTS.find(x => x.id === id);
    document.getElementById('productModalTitle').textContent = 'Edit product';
    document.getElementById('pf_name').value = p.name;
    document.getElementById('pf_category').value = p.category;
    document.getElementById('pf_icon').value = p.icon;
    document.getElementById('pf_price').value = p.price;
    document.getElementById('pf_compare').value = p.compare_price || '';
    document.getElementById('pf_stock').value = p.stock;
    document.getElementById('pf_badge').value = p.badge || '';
    document.getElementById('pf_accent').value = p.accent;
    if (p.description) descriptionEditor.root.innerHTML = p.description;
    document.getElementById('pf_description').value = p.description || '';
    if (productImageSrc(p)) showImagePreview(productImageSrc(p));
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
  formData.append('description', document.getElementById('pf_description').value.trim());
  if (SELECTED_IMAGE_FILE) formData.append('image', SELECTED_IMAGE_FILE);
  if (REMOVE_IMAGE) formData.append('remove_image', 'true');

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

checkAuth();
