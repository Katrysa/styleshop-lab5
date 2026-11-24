'use strict';
/* routes/orders.js — замовлення: створення відкрите, перегляд / зміна статусу / видалення — для адміністратора */
const { HttpError } = require('../errors');
const validate = require('../validate');

function orderId(ctx) {
  const id = Number(ctx.params.id);
  if (!Number.isInteger(id) || id < 1) { throw new HttpError(404, 'not_found', 'Замовлення не знайдено'); }
  return id;
}

module.exports = function register(router, { db, config, admin }) {
  router.post('/api/orders', (ctx) => {
    const value = validate.order(ctx.body, config, (id) => db.getProduct(id));
    const order = db.createOrder(value);
    ctx.send(201, order, { Location: `/api/orders/${order.id}` });   // повертаємо суми, пораховані сервером
  });

  router.get('/api/orders', admin, (ctx) => {
    const status = ctx.query.get('status');
    if (status && !config.orderStatuses.includes(status)) {
      throw new HttpError(400, 'validation', 'Некоректні параметри запиту', { status: 'Невідомий статус' });
    }
    ctx.send(200, db.listOrders(status || null));
  });

  router.get('/api/orders/:id', admin, (ctx) => {
    const order = db.getOrder(orderId(ctx));
    if (!order) { throw new HttpError(404, 'not_found', 'Замовлення не знайдено'); }
    ctx.send(200, order);
  });

  router.patch('/api/orders/:id', admin, (ctx) => {
    const value = validate.status(ctx.body, config);
    const order = db.updateOrderStatus(orderId(ctx), value.status);
    if (!order) { throw new HttpError(404, 'not_found', 'Замовлення не знайдено'); }
    ctx.send(200, order);
  });

  router.delete('/api/orders/:id', admin, (ctx) => {
    if (!db.deleteOrder(orderId(ctx))) { throw new HttpError(404, 'not_found', 'Замовлення не знайдено'); }
    ctx.sendEmpty(204);
  });
};
