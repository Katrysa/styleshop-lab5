'use strict';
/* routes/forms.js — підписка, повідомлення зворотного зв’язку, конфігурація й перевірка стану */
const { HttpError } = require('../errors');
const validate = require('../validate');

module.exports = function register(router, { db, config, admin }) {
  router.get('/api/health', (ctx) => {
    ctx.send(200, { status: db.health() ? 'ok' : 'degraded', uptime: Math.round(process.uptime()) });
  });

  router.get('/api/config', (ctx) => {
    ctx.send(200, { freeFrom: config.freeFrom, maxQty: config.maxQty, sizes: config.sizes, delivery: config.delivery });
  });

  router.post('/api/subscribers', (ctx) => {
    const { email } = validate.subscriber(ctx.body);
    const created = db.addSubscriber(email);
    ctx.send(created ? 201 : 200, { email, already_subscribed: !created });
  });
  router.get('/api/subscribers', admin, (ctx) => ctx.send(200, db.listSubscribers()));

  router.post('/api/messages', (ctx) => {
    const saved = db.addMessage(validate.message(ctx.body));
    ctx.send(201, { id: saved.id });
  });
  router.get('/api/messages', admin, (ctx) => ctx.send(200, db.listMessages()));
  router.delete('/api/messages/:id', admin, (ctx) => {
    const id = Number(ctx.params.id);
    if (!Number.isInteger(id) || !db.deleteMessage(id)) { throw new HttpError(404, 'not_found', 'Повідомлення не знайдено'); }
    ctx.sendEmpty(204);
  });
};
