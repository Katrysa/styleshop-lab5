'use strict';
/* Автоматичні тести REST API (вбудований тестовий запускач Node.js): node --test test/ */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const baseConfig = require('../server/config');
const { createDb } = require('../server/db');
const { createApp } = require('../server/app');

const TOKEN = 'test-admin-token-123456';

async function start(overrides = {}) {
  const config = { ...baseConfig, adminToken: TOKEN, log: false, dbPath: ':memory:',
    rate: { ...baseConfig.rate, ...(overrides.rate || {}) }, ...(overrides.top || {}) };
  const db = createDb(':memory:', config);
  db.seedIfNeeded();
  const { handler } = createApp({ db, config });
  const server = http.createServer(handler);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (method, url, { body, token, headers, raw } = {}) => {
    const h = { ...(headers || {}) };
    if (body !== undefined && !raw) { h['Content-Type'] = h['Content-Type'] || 'application/json'; }
    if (token) { h.Authorization = `Bearer ${token}`; }
    const res = await fetch(base + url, { method, headers: h, body: raw ? body : (body === undefined ? undefined : JSON.stringify(body)) });
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch (e) { /* не JSON */ }
    return { status: res.status, json, text, headers: res.headers };
  };
  return { call, port: server.address().port, close: async () => { server.close(); db.close(); }, db };
}

const goodOrder = (extra = {}) => ({
  first_name: 'Катерина', last_name: 'Куца', phone: '+38 (050) 123-45-67', email: 'Kate@Example.com',
  address: 'Київ, відділення №5', delivery: 'np', payment: 'card', note: '', agree: true,
  items: [{ productId: 'jeans', size: 'M', color: 'Індиго', qty: 2 }], ...extra,
});
const goodProduct = (extra = {}) => ({
  id: 'test-hoodie', name: 'Худі', category: 'Светри', price: 1500, badge: '', description: 'Тест', info: 'Тест',
  shape: 'sweater', colors: [{ name: 'Чорний', hex: '#111111' }], sizes: ['M', 'L'], ...extra,
});

test('health і config', async () => {
  const s = await start();
  const h = await s.call('GET', '/api/health');
  assert.equal(h.status, 200); assert.equal(h.json.status, 'ok');
  const c = await s.call('GET', '/api/config');
  assert.equal(c.json.freeFrom, 2000); assert.deepEqual(c.json.sizes, ['XS', 'S', 'M', 'L', 'XL']);
  await s.close();
});

test('GET /api/products: список, фільтри, сортування, помилки параметрів', async () => {
  const s = await start();
  const all = await s.call('GET', '/api/products');
  assert.equal(all.status, 200); assert.equal(all.json.length, 8);
  assert.ok(all.json[0].colors.length >= 1 && all.json[0].sizes.length >= 1);
  assert.equal((await s.call('GET', '/api/products?category=' + encodeURIComponent('Джинси'))).json.length, 1);
  assert.equal((await s.call('GET', '/api/products?q=' + encodeURIComponent('ДЖИНС'))).json.length, 1);
  assert.equal((await s.call('GET', '/api/products?min=2000&max=2500')).json.length, 2);
  const asc = (await s.call('GET', '/api/products?sort=price-asc')).json;
  assert.equal(asc[0].id, 'bag'); assert.equal(asc.at(-1).id, 'jacket');
  assert.equal((await s.call('GET', '/api/products?min=abc')).status, 400);
  assert.equal((await s.call('GET', '/api/products?sort=evil')).status, 400);
  await s.close();
});

test('SQL-ін’єкція в параметрах не ламає запит і нічого не повертає', async () => {
  const s = await start();
  const r = await s.call('GET', "/api/products?category=" + encodeURIComponent("' OR '1'='1"));
  assert.equal(r.status, 200); assert.equal(r.json.length, 0);
  const r2 = await s.call('GET', '/api/products/' + encodeURIComponent("jeans' OR '1'='1"));
  assert.equal(r2.status, 404);
  assert.equal((await s.call('GET', '/api/products')).json.length, 8);   // таблиця на місці
  await s.close();
});

test('GET /api/products/:id і 404', async () => {
  const s = await start();
  const ok = await s.call('GET', '/api/products/jeans');
  assert.equal(ok.status, 200); assert.equal(ok.json.name, 'Прямі джинси'); assert.deepEqual(ok.json.sizes, ['S', 'M', 'L', 'XL']);
  const nf = await s.call('GET', '/api/products/nope');
  assert.equal(nf.status, 404); assert.equal(nf.json.error.code, 'not_found');
  await s.close();
});

test('CRUD товарів вимагає токен адміністратора', async () => {
  const s = await start();
  assert.equal((await s.call('POST', '/api/products', { body: goodProduct() })).status, 401);
  assert.equal((await s.call('POST', '/api/products', { body: goodProduct(), token: 'wrong' })).status, 401);
  const created = await s.call('POST', '/api/products', { body: goodProduct(), token: TOKEN });
  assert.equal(created.status, 201); assert.equal(created.headers.get('location'), '/api/products/test-hoodie');
  assert.equal((await s.call('POST', '/api/products', { body: goodProduct(), token: TOKEN })).status, 409);   // дубль id
  const upd = await s.call('PUT', '/api/products/test-hoodie', { body: goodProduct({ name: 'Худі oversize', price: 1600, sizes: ['S'] }), token: TOKEN });
  assert.equal(upd.status, 200); assert.equal(upd.json.price, 1600); assert.deepEqual(upd.json.sizes, ['S']);
  assert.equal((await s.call('GET', '/api/products/test-hoodie')).json.name, 'Худі oversize');
  assert.equal((await s.call('PUT', '/api/products/missing', { body: goodProduct(), token: TOKEN })).status, 404);
  assert.equal((await s.call('DELETE', '/api/products/test-hoodie', { token: TOKEN })).status, 204);
  assert.equal((await s.call('GET', '/api/products/test-hoodie')).status, 404);
  assert.equal((await s.call('DELETE', '/api/products/test-hoodie', { token: TOKEN })).status, 404);
  await s.close();
});

test('валідація товару повертає помилки по полях', async () => {
  const s = await start();
  const bad = await s.call('POST', '/api/products', { token: TOKEN, body: { id: 'X', name: '', category: 'a', price: -5, colors: [{ name: 'Z', hex: 'red' }], sizes: ['XXL'], shape: 'ufo' } });
  assert.equal(bad.status, 400); assert.equal(bad.json.error.code, 'validation');
  for (const f of ['id', 'name', 'category', 'price', 'colors', 'sizes', 'shape']) { assert.ok(bad.json.error.fields[f], 'немає помилки для ' + f); }
  const str = await s.call('POST', '/api/products', { token: TOKEN, body: goodProduct({ price: '1500' }) });
  assert.equal(str.status, 400);                               // ціна-рядок відхиляється
  await s.close();
});

test('POST /api/orders: сервер сам рахує суми, ігнорує ціни клієнта', async () => {
  const s = await start();
  const r = await s.call('POST', '/api/orders', { body: goodOrder({ items: [{ productId: 'jeans', size: 'M', color: 'Індиго', qty: 2, price: 1 }], total: 1 }) });
  assert.equal(r.status, 201);
  assert.equal(r.json.subtotal, 4380); assert.equal(r.json.delivery_cost, 0); assert.equal(r.json.total, 4380);
  assert.match(r.json.number, /^SS-\d{5}$/); assert.equal(r.json.status, 'new');
  assert.equal(r.json.phone, '+380501234567'); assert.equal(r.json.email, 'kate@example.com');
  assert.equal(r.json.items[0].price, 2190);
  const cheap = await s.call('POST', '/api/orders', { body: goodOrder({ items: [{ productId: 'bag', size: 'M', color: 'Пісочний', qty: 1 }] }) });
  assert.equal(cheap.json.delivery_cost, 70); assert.equal(cheap.json.total, 520);
  const pick = await s.call('POST', '/api/orders', { body: goodOrder({ delivery: 'pickup', items: [{ productId: 'bag', size: 'M', color: 'Пісочний', qty: 1 }] }) });
  assert.equal(pick.json.delivery_cost, 0);
  const up = await s.call('POST', '/api/orders', { body: goodOrder({ delivery: 'up', items: [{ productId: 'bag', size: 'M', color: 'Пісочний', qty: 1 }] }) });
  assert.equal(up.json.delivery_cost, 45);
  await s.close();
});

test('POST /api/orders: перевірка помилок', async () => {
  const s = await start();
  const empty = await s.call('POST', '/api/orders', { body: {} });
  assert.equal(empty.status, 400);
  for (const f of ['first_name', 'last_name', 'phone', 'email', 'address', 'delivery', 'payment', 'agree', 'items']) { assert.ok(empty.json.error.fields[f], f); }
  const cases = [
    goodOrder({ phone: '12345' }), goodOrder({ email: 'abc@' }), goodOrder({ first_name: 'К1' }), goodOrder({ address: 'Київ' }),
    goodOrder({ delivery: 'drone' }), goodOrder({ payment: 'gold' }), goodOrder({ agree: false }), goodOrder({ note: 'x'.repeat(301) }),
    goodOrder({ items: [] }), goodOrder({ items: [{ productId: 'nope', size: 'M', color: 'Індиго', qty: 1 }] }),
    goodOrder({ items: [{ productId: 'jeans', size: 'XS', color: 'Індиго', qty: 1 }] }),
    goodOrder({ items: [{ productId: 'jeans', size: 'M', color: 'Рожевий', qty: 1 }] }),
    goodOrder({ items: [{ productId: 'jeans', size: 'M', color: 'Індиго', qty: 0 }] }),
    goodOrder({ items: [{ productId: 'jeans', size: 'M', color: 'Індиго', qty: 11 }] }),
    goodOrder({ items: [{ productId: 'jeans', size: 'M', color: 'Індиго', qty: 1.5 }] }),
    goodOrder({ items: 'drop table' }),
  ];
  for (const body of cases) { assert.equal((await s.call('POST', '/api/orders', { body })).status, 400, JSON.stringify(body).slice(0, 90)); }
  assert.equal((await s.call('POST', '/api/orders', { body: [1, 2, 3] })).status, 400);
  assert.equal((await s.call('POST', '/api/orders', { body: '{bad json', raw: true, headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await s.call('POST', '/api/orders', { body: 'a=1', raw: true, headers: { 'Content-Type': 'text/plain' } })).status, 415);
  await s.close();
});

test('замовлення: перегляд, зміна статусу, видалення (адміністратор)', async () => {
  const s = await start();
  const o = (await s.call('POST', '/api/orders', { body: goodOrder() })).json;
  assert.equal((await s.call('GET', '/api/orders')).status, 401);
  const list = await s.call('GET', '/api/orders', { token: TOKEN });
  assert.equal(list.status, 200); assert.equal(list.json.length, 1); assert.equal(list.json[0].items.length, 1);
  assert.equal((await s.call('GET', '/api/orders/' + o.id, { token: TOKEN })).json.number, o.number);
  assert.equal((await s.call('GET', '/api/orders?status=bad', { token: TOKEN })).status, 400);
  assert.equal((await s.call('PATCH', `/api/orders/${o.id}`, { body: { status: 'shipped' }, token: TOKEN })).json.status, 'shipped');
  assert.equal((await s.call('GET', '/api/orders?status=shipped', { token: TOKEN })).json.length, 1);
  assert.equal((await s.call('GET', '/api/orders?status=new', { token: TOKEN })).json.length, 0);
  assert.equal((await s.call('PATCH', `/api/orders/${o.id}`, { body: { status: 'hacked' }, token: TOKEN })).status, 400);
  assert.equal((await s.call('PATCH', '/api/orders/9999', { body: { status: 'new' }, token: TOKEN })).status, 404);
  assert.equal((await s.call('GET', '/api/orders/abc', { token: TOKEN })).status, 404);
  assert.equal((await s.call('DELETE', `/api/orders/${o.id}`, { token: TOKEN })).status, 204);
  assert.equal((await s.call('GET', `/api/orders/${o.id}`, { token: TOKEN })).status, 404);
  await s.close();
});

test('видалення товару не ламає історію замовлень', async () => {
  const s = await start();
  const o = (await s.call('POST', '/api/orders', { body: goodOrder() })).json;
  await s.call('DELETE', '/api/products/jeans', { token: TOKEN });
  const again = await s.call('GET', '/api/orders/' + o.id, { token: TOKEN });
  assert.equal(again.json.items[0].name, 'Прямі джинси');
  await s.close();
});

test('підписка та повідомлення', async () => {
  const s = await start();
  assert.equal((await s.call('POST', '/api/subscribers', { body: { email: 'bad' } })).status, 400);
  const a = await s.call('POST', '/api/subscribers', { body: { email: 'A@B.ua' } });
  assert.equal(a.status, 201); assert.equal(a.json.email, 'a@b.ua');
  const b = await s.call('POST', '/api/subscribers', { body: { email: 'a@b.ua' } });
  assert.equal(b.status, 200); assert.equal(b.json.already_subscribed, true);
  assert.equal((await s.call('GET', '/api/subscribers')).status, 401);
  assert.equal((await s.call('GET', '/api/subscribers', { token: TOKEN })).json.length, 1);
  assert.equal((await s.call('POST', '/api/messages', { body: { name: 'Катя', email: 'k@k.ua', message: 'Привіт' } })).status, 400);
  const m = await s.call('POST', '/api/messages', { body: { name: 'Катя', email: 'k@k.ua', message: 'Підкажіть, чи є розмір S?' } });
  assert.equal(m.status, 201);
  const list = await s.call('GET', '/api/messages', { token: TOKEN });
  assert.equal(list.json.length, 1);
  assert.equal((await s.call('DELETE', '/api/messages/' + m.json.id, { token: TOKEN })).status, 204);
  assert.equal((await s.call('DELETE', '/api/messages/' + m.json.id, { token: TOKEN })).status, 404);
  await s.close();
});

test('XSS-рядок зберігається як звичайний текст (екранування — на клієнті)', async () => {
  const s = await start();
  const evil = '<img src=x onerror=alert(1)>';
  const m = await s.call('POST', '/api/messages', { body: { name: 'Катя', email: 'k@k.ua', message: evil + ' повідомлення' } });
  assert.equal(m.status, 201);
  const list = await s.call('GET', '/api/messages', { token: TOKEN });
  assert.ok(list.json[0].message.startsWith(evil));
  assert.match(list.headers.get('content-type'), /application\/json/);     // не HTML
  await s.close();
});

test('маршрути: 404, 405, обмеження розміру тіла', async () => {
  const s = await start();
  assert.equal((await s.call('GET', '/api/unknown')).status, 404);
  const m = await s.call('PUT', '/api/orders');
  assert.equal(m.status, 405); assert.match(m.headers.get('allow'), /POST/);
  assert.equal((await s.call('POST', '/', { body: {} })).status, 405);
  const big = await s.call('POST', '/api/messages', { body: JSON.stringify({ name: 'Катя', email: 'k@k.ua', message: 'x'.repeat(200 * 1024) }), raw: true, headers: { 'Content-Type': 'application/json' } });
  assert.equal(big.status, 413);
  await s.close();
});

test('адміністратор вимкнений без ADMIN_TOKEN', async () => {
  const s = await start({ top: { adminToken: '' } });
  const r = await s.call('GET', '/api/orders', { token: 'anything' });
  assert.equal(r.status, 503);
  await s.close();
});

test('обмеження частоти запитів і блокування підбору токена', async () => {
  const s = await start({ rate: { max: 1000, writeMax: 3, authFailMax: 3 } });
  const codes = [];
  for (let i = 0; i < 5; i += 1) { codes.push((await s.call('POST', '/api/subscribers', { body: { email: `u${i}@b.ua` } })).status); }
  assert.deepEqual(codes, [201, 201, 201, 429, 429]);
  const t = await start({ rate: { max: 1000, writeMax: 1000, authFailMax: 3 } });
  const res = [];
  for (let i = 0; i < 5; i += 1) { res.push((await t.call('GET', '/api/orders', { token: 'guess' + i })).status); }
  assert.deepEqual(res, [401, 401, 401, 429, 429]);
  assert.equal((await t.call('GET', '/api/orders', { token: TOKEN })).status, 429);   // правильний токен теж заблоковано на час
  await s.close(); await t.close();
});

test('заголовки безпеки та кешування', async () => {
  const s = await start();
  const r = await s.call('GET', '/api/products');
  assert.match(r.headers.get('content-security-policy'), /default-src 'self'/);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(r.headers.get('x-powered-by'), null);
  await s.close();
});

test('генерація зображень товарів і статичні файли', async () => {
  const fs = require('node:fs');
  const dir = path.join(__dirname, '..', 'public');
  const s = await start({ top: { publicDir: dir } });
  const img = await s.call('GET', '/img/jeans-2.svg');
  assert.equal(img.status, 200); assert.match(img.headers.get('content-type'), /image\/svg\+xml/); assert.ok(img.text.includes('#4A443E'));
  assert.equal((await s.call('GET', '/img/jeans-9.svg')).status, 404);
  assert.equal((await s.call('GET', '/img/nope-1.svg')).status, 404);
  assert.ok(fs.existsSync(path.join(dir, 'index.html')), 'клієнтська частина має лежати в public/');
  const home = await s.call('GET', '/');
  assert.equal(home.status, 200); assert.match(home.headers.get('content-type'), /text\/html/);
  assert.ok(home.text.includes('STYLESHOP'));
  const css = await s.call('GET', '/css/base.css', { headers: { 'Accept-Encoding': 'gzip' } });
  assert.equal(css.status, 200); assert.match(css.headers.get('cache-control'), /max-age/);
  const etag = css.headers.get('etag');
  assert.ok(etag);
  const again = await fetch(`http://127.0.0.1:${s.port}/css/base.css`, { headers: { 'If-None-Match': etag } });
  assert.equal(again.status, 304);
  const missing = await s.call('GET', '/no-such-page.html');
  assert.equal(missing.status, 404); assert.ok(missing.text.includes('Сторінку не знайдено'));
  for (const bad of ['/../package.json', '/%2e%2e/package.json', '/..%2fserver/config.js', '/.env', '/%00', '/server/config.js']) {
    const r = await s.call('GET', bad);
    assert.ok([400, 404].includes(r.status), bad + ' -> ' + r.status);
    assert.ok(!r.text.includes('adminToken'), bad);
  }
  await s.close();
});
