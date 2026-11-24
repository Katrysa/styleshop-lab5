'use strict';
/* routes/products.js — CRUD товарів: читання відкрите, створення/зміна/видалення — лише для адміністратора */
const { HttpError } = require('../errors');
const validate = require('../validate');

function number(value, name) {
  if (value === null || value === '') { return null; }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) { throw new HttpError(400, 'validation', 'Некоректні параметри запиту', { [name]: 'Очікується невід’ємне число' }); }
  return n;
}

module.exports = function register(router, { db, config, admin }) {
  router.get('/api/products', (ctx) => {
    const q = ctx.query;
    const sort = q.get('sort');
    if (sort && !['price-asc', 'price-desc', 'name'].includes(sort)) {
      throw new HttpError(400, 'validation', 'Некоректні параметри запиту', { sort: 'Допустимо: price-asc, price-desc, name' });
    }
    const list = db.listProducts({
      category: (q.get('category') || '').trim(), q: (q.get('q') || '').trim().slice(0, 80),
      min: number(q.get('min'), 'min'), max: number(q.get('max'), 'max'), sort,
    });
    ctx.send(200, list);
  });

  router.get('/api/products/:id', (ctx) => {
    const product = db.getProduct(ctx.params.id);
    if (!product) { throw new HttpError(404, 'not_found', 'Товар не знайдено'); }
    ctx.send(200, product);
  });

  router.post('/api/products', admin, (ctx) => {
    const value = validate.product(ctx.body, config, { withId: true });
    const created = db.createProduct(value);
    ctx.send(201, created, { Location: `/api/products/${created.id}` });
  });

  router.put('/api/products/:id', admin, (ctx) => {
    const value = validate.product(ctx.body, config, { withId: false });
    const updated = db.updateProduct(ctx.params.id, value);
    if (!updated) { throw new HttpError(404, 'not_found', 'Товар не знайдено'); }
    ctx.send(200, updated);
  });

  router.delete('/api/products/:id', admin, (ctx) => {
    if (!db.deleteProduct(ctx.params.id)) { throw new HttpError(404, 'not_found', 'Товар не знайдено'); }
    ctx.sendEmpty(204);
  });
};
