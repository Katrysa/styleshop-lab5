'use strict';
/* db.js — база даних SQLite (вбудований модуль node:sqlite): схема, початкові дані, запити.
   Усі значення передаються через параметри prepared statements, тому SQL-ін’єкції неможливі. */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { HttpError } = require('./errors');
const SEED = require('./seed');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY CHECK (length(id) BETWEEN 2 AND 40),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL CHECK (price > 0),
  badge TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  info TEXT NOT NULL DEFAULT '',
  shape TEXT NOT NULL DEFAULT 'tshirt',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS product_colors (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  name TEXT NOT NULL,
  hex TEXT NOT NULL,
  PRIMARY KEY (product_id, position)
);
CREATE TABLE IF NOT EXISTS product_sizes (
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size TEXT NOT NULL,
  PRIMARY KEY (product_id, size)
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  number TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  address TEXT NOT NULL,
  delivery TEXT NOT NULL,
  payment TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  subtotal INTEGER NOT NULL,
  delivery_cost INTEGER NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','confirmed','shipped','delivered','cancelled')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  size TEXT NOT NULL,
  price INTEGER NOT NULL,
  qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 10)
);
CREATE TABLE IF NOT EXISTS subscribers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`;

const isConstraint = (err) => /constraint failed/i.test(String(err && err.message));

function createDb(file, config) {
  if (file !== ':memory:') {
    fs.mkdirSync(path.dirname(file), { recursive: true });
  }
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys = ON;');
  if (file !== ':memory:') { db.exec('PRAGMA journal_mode = WAL;'); }
  db.exec(SCHEMA);

  const sizeRank = (s) => config.sizes.indexOf(s);

  function tx(fn) {                       // транзакція: усе або нічого
    db.exec('BEGIN');
    try {
      const result = fn();
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  /* ---------- товари ---------- */
  function hydrate(rows) {
    if (!rows.length) { return []; }
    const ids = rows.map((r) => r.id);
    const marks = ids.map(() => '?').join(',');          // лише символи «?», дані — окремо
    const colors = db.prepare(`SELECT product_id, name, hex FROM product_colors WHERE product_id IN (${marks}) ORDER BY product_id, position`).all(...ids);
    const sizes = db.prepare(`SELECT product_id, size FROM product_sizes WHERE product_id IN (${marks})`).all(...ids);
    return rows.map((r) => ({
      id: r.id, name: r.name, category: r.category, price: r.price, badge: r.badge,
      description: r.description, info: r.info, shape: r.shape,
      colors: colors.filter((c) => c.product_id === r.id).map((c) => ({ name: c.name, hex: c.hex })),
      sizes: sizes.filter((s) => s.product_id === r.id).map((s) => s.size).sort((a, b) => sizeRank(a) - sizeRank(b)),
    }));
  }

  function listProducts({ category, min, max, q, sort } = {}) {
    const where = [];
    const params = [];
    if (category) { where.push('category = ?'); params.push(category); }
    if (min !== null && min !== undefined) { where.push('price >= ?'); params.push(min); }
    if (max !== null && max !== undefined) { where.push('price <= ?'); params.push(max); }
    const order = { 'price-asc': 'price ASC, rowid ASC', 'price-desc': 'price DESC, rowid ASC' }[sort] || 'rowid ASC';
    const sql = 'SELECT id, name, category, price, badge, description, info, shape FROM products' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') + ' ORDER BY ' + order;
    let list = hydrate(db.prepare(sql).all(...params));
    if (q) {                                             // пошук без урахування регістру (Unicode)
      const needle = q.toLowerCase();
      list = list.filter((p) => (p.name + ' ' + p.category).toLowerCase().includes(needle));
    }
    if (sort === 'name') { list.sort((a, b) => a.name.localeCompare(b.name, 'uk')); }
    return list;
  }

  function getProduct(id) {
    const row = db.prepare('SELECT id, name, category, price, badge, description, info, shape FROM products WHERE id = ?').get(id);
    return row ? hydrate([row])[0] : null;
  }

  function writeVariants(id, p) {
    const insColor = db.prepare('INSERT INTO product_colors (product_id, position, name, hex) VALUES (?, ?, ?, ?)');
    p.colors.forEach((c, i) => insColor.run(id, i, c.name, c.hex));
    const insSize = db.prepare('INSERT INTO product_sizes (product_id, size) VALUES (?, ?)');
    p.sizes.forEach((s) => insSize.run(id, s));
  }

  function createProduct(p) {
    try {
      tx(() => {
        db.prepare('INSERT INTO products (id, name, category, price, badge, description, info, shape) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(p.id, p.name, p.category, p.price, p.badge, p.description, p.info, p.shape);
        writeVariants(p.id, p);
      });
    } catch (err) {
      if (isConstraint(err)) { throw new HttpError(409, 'conflict', 'Товар з таким ідентифікатором уже існує'); }
      throw err;
    }
    return getProduct(p.id);
  }

  function updateProduct(id, p) {
    if (!getProduct(id)) { return null; }
    tx(() => {
      db.prepare("UPDATE products SET name = ?, category = ?, price = ?, badge = ?, description = ?, info = ?, shape = ?, updated_at = datetime('now') WHERE id = ?")
        .run(p.name, p.category, p.price, p.badge, p.description, p.info, p.shape, id);
      db.prepare('DELETE FROM product_colors WHERE product_id = ?').run(id);
      db.prepare('DELETE FROM product_sizes WHERE product_id = ?').run(id);
      writeVariants(id, p);
    });
    return getProduct(id);
  }

  function deleteProduct(id) {
    return db.prepare('DELETE FROM products WHERE id = ?').run(id).changes > 0;
  }

  /* ---------- замовлення ---------- */
  function deliveryCost(key, subtotal) {
    if (key === 'pickup' || subtotal >= config.freeFrom) { return 0; }
    return config.delivery[key].price;
  }

  function orderItems(orderIds) {
    if (!orderIds.length) { return []; }
    const marks = orderIds.map(() => '?').join(',');
    return db.prepare(`SELECT order_id, product_id, name, color, size, price, qty FROM order_items WHERE order_id IN (${marks}) ORDER BY id`).all(...orderIds);
  }
  function attachItems(rows) {
    const items = orderItems(rows.map((r) => r.id));
    return rows.map((r) => ({
      ...r,
      items: items.filter((i) => i.order_id === r.id).map(({ order_id, ...rest }) => rest),
    }));
  }

  function createOrder(v) {
    const subtotal = v.items.reduce((sum, it) => sum + it.product.price * it.qty, 0);   // ціни беруться з бази, а не від клієнта
    const cost = deliveryCost(v.delivery, subtotal);
    const id = tx(() => {
      const res = db.prepare(`INSERT INTO orders (number, first_name, last_name, phone, email, address, delivery, payment, note, subtotal, delivery_cost, total)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .run('tmp-' + Math.random().toString(36).slice(2), v.first_name, v.last_name, v.phone, v.email, v.address, v.delivery, v.payment, v.note, subtotal, cost, subtotal + cost);
      const orderId = Number(res.lastInsertRowid);
      db.prepare('UPDATE orders SET number = ? WHERE id = ?').run('SS-' + String(orderId).padStart(5, '0'), orderId);
      const ins = db.prepare('INSERT INTO order_items (order_id, product_id, name, color, size, price, qty) VALUES (?, ?, ?, ?, ?, ?, ?)');
      v.items.forEach((it) => ins.run(orderId, it.product.id, it.product.name, it.color, it.size, it.product.price, it.qty));
      return orderId;
    });
    return getOrder(id);
  }

  function getOrder(id) {
    const row = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    return row ? attachItems([row])[0] : null;
  }
  function listOrders(status) {
    const rows = status
      ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 200').all(status)
      : db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 200').all();
    return attachItems(rows);
  }
  function updateOrderStatus(id, status) {
    const res = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, id);
    return res.changes ? getOrder(id) : null;
  }
  function deleteOrder(id) {
    return db.prepare('DELETE FROM orders WHERE id = ?').run(id).changes > 0;
  }

  /* ---------- підписники та повідомлення ---------- */
  function addSubscriber(email) {
    const res = db.prepare('INSERT OR IGNORE INTO subscribers (email) VALUES (?)').run(email);
    return res.changes > 0;                              // false — така адреса вже є
  }
  const listSubscribers = () => db.prepare('SELECT id, email, created_at FROM subscribers ORDER BY id DESC LIMIT 500').all();
  function addMessage(m) {
    const res = db.prepare('INSERT INTO messages (name, email, message) VALUES (?, ?, ?)').run(m.name, m.email, m.message);
    return db.prepare('SELECT * FROM messages WHERE id = ?').get(Number(res.lastInsertRowid));
  }
  const listMessages = () => db.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all();
  const deleteMessage = (id) => db.prepare('DELETE FROM messages WHERE id = ?').run(id).changes > 0;

  /* ---------- службове ---------- */
  function seedIfNeeded() {
    const done = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get();
    if (done) { return 0; }
    tx(() => {
      SEED.forEach((p) => {
        db.prepare('INSERT INTO products (id, name, category, price, badge, description, info, shape) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
          .run(p.id, p.name, p.category, p.price, p.badge, p.description, p.info, p.shape);
        writeVariants(p.id, p);
      });
      db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', '1')").run();
    });
    return SEED.length;
  }
  const health = () => db.prepare('SELECT 1 AS ok').get().ok === 1;

  return {
    seedIfNeeded, health, close: () => db.close(),
    listProducts, getProduct, createProduct, updateProduct, deleteProduct,
    createOrder, getOrder, listOrders, updateOrderStatus, deleteOrder,
    addSubscriber, listSubscribers, addMessage, listMessages, deleteMessage,
  };
}
module.exports = { createDb };
