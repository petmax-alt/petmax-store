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

  function lineKey(id, variantId) {
    return `${id}::${variantId || 'base'}`;
  }

  function addItem(product, qty = 1, variant = null) {
    const items = read();
    const key = lineKey(product.id, variant && variant.id);
    const existing = items.find(i => lineKey(i.id, i.variant_id) === key);
    if (existing) {
      existing.qty += qty;
    } else {
      items.push({
        id: product.id,
        variant_id: variant ? variant.id : null,
        name: variant ? `${product.name} — ${variant.label}` : product.name,
        price: variant ? variant.price : product.price,
        category: product.category,
        icon: product.icon,
        accent: product.accent,
        stock: variant ? variant.stock : product.stock,
        qty,
      });
    }
    write(items);
  }

  function setQty(id, qty, variantId = null) {
    let items = read();
    const key = lineKey(id, variantId);
    if (qty <= 0) {
      items = items.filter(i => lineKey(i.id, i.variant_id) !== key);
    } else {
      const item = items.find(i => lineKey(i.id, i.variant_id) === key);
      if (item) item.qty = qty;
    }
    write(items);
  }

  function removeItem(id, variantId = null) {
    const key = lineKey(id, variantId);
    const items = read().filter(i => lineKey(i.id, i.variant_id) !== key);
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
