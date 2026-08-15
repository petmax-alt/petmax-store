// ============================================
// Pet Max — Admin panel logic
// ============================================
const fmt = (n) => `Rs ${Number(n).toLocaleString('en-PK')}`;

let PRODUCTS = [];
let ORDERS = [];
let EDITING_PRODUCT_ID = null;

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
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
document.querySelectorAll('.admin-nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.admin-nav-item[data-view]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    ['dashboard', 'products', 'orders'].forEach(v => {
      document.getElementById(`view-${v}`).hidden = v !== btn.dataset.view;
    });
  });
});

// ---------------- Load data ----------------
async function loadAll() {
  await Promise.all([loadProducts(), loadOrders()]);
  renderDashboard();
  renderProductsTable();
  renderOrdersTable();
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

// ---------------- Dashboard ----------------
function renderDashboard() {
  const totalRevenue = ORDERS.reduce((s, o) => s + o.total, 0);
  const pendingOrders = ORDERS.filter(o => o.status === 'new').length;
  const lowStock = PRODUCTS.filter(p => p.stock > 0 && p.stock <= 5).length;

  document.getElementById('statRow').innerHTML = `
    <div class="stat-card"><span>Total orders</span><b>${ORDERS.length}</b></div>
    <div class="stat-card"><span>Revenue</span><b>${fmt(totalRevenue)}</b></div>
    <div class="stat-card"><span>New / pending</span><b>${pendingOrders}</b></div>
    <div class="stat-card"><span>Low stock items</span><b>${lowStock}</b></div>
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
}

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
      <td><div class="admin-thumb">${getProductIcon(p.icon, p.accent)}</div></td>
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
    document.getElementById('pf_description').value = p.description || '';
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

  const payload = {
    name: document.getElementById('pf_name').value.trim(),
    category: document.getElementById('pf_category').value,
    icon: document.getElementById('pf_icon').value,
    price: Number(document.getElementById('pf_price').value),
    compare_price: document.getElementById('pf_compare').value ? Number(document.getElementById('pf_compare').value) : '',
    stock: Number(document.getElementById('pf_stock').value),
    badge: document.getElementById('pf_badge').value,
    accent: document.getElementById('pf_accent').value,
    description: document.getElementById('pf_description').value.trim(),
  };

  const saveBtn = document.getElementById('productSaveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving…';

  try {
    const url = EDITING_PRODUCT_ID ? `/api/products/${EDITING_PRODUCT_ID}` : '/api/products';
    const method = EDITING_PRODUCT_ID ? 'PUT' : 'POST';
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
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
