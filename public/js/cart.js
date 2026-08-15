// ============================================
// Pet Max — Cart store (localStorage-backed)
// ============================================
const Cart = (() => {
  const KEY = 'petmax_cart_v1';

  function read() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function write(items) {
    localStorage.setItem(KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('cart:changed', { detail: items }));
  }

  function getItems() {
    return read();
  }

  function addItem(product, qty = 1) {
    const items = read();
    const existing = items.find(i => i.id === product.id);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        id: product.id,
        name: product.name,
        price: product.price,
        category: product.category,
        icon: product.icon,
        accent: product.accent,
        stock: product.stock,
        qty,
      });
    }
    write(items);
  }

  function setQty(id, qty) {
    let items = read();
    if (qty <= 0) {
      items = items.filter(i => i.id !== id);
    } else {
      const item = items.find(i => i.id === id);
      if (item) item.qty = qty;
    }
    write(items);
  }

  function removeItem(id) {
    const items = read().filter(i => i.id !== id);
    write(items);
  }

  function clear() {
    write([]);
  }

  function count() {
    return read().reduce((sum, i) => sum + i.qty, 0);
  }

  function subtotal() {
    return read().reduce((sum, i) => sum + i.price * i.qty, 0);
  }

  return { getItems, addItem, setQty, removeItem, clear, count, subtotal };
})();
