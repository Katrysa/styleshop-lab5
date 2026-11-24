'use strict';
/* index.js — точка входу: відкриває базу даних, наповнює її початковими даними й запускає HTTP-сервер */
const http = require('node:http');
const config = require('./config');
const { createDb } = require('./db');
const { createApp } = require('./app');

const db = createDb(config.dbPath, config);
const seeded = db.seedIfNeeded();
if (seeded) { console.log(`База даних порожня: додано ${seeded} початкових товарів`); }
if (!config.adminToken) { console.warn('УВАГА: ADMIN_TOKEN не задано — адміністративні маршрути вимкнено'); }

const { handler } = createApp({ db, config });
const server = http.createServer(handler);
server.requestTimeout = 15_000;      // захист від повільних запитів
server.headersTimeout = 10_000;

server.listen(config.port, config.host, () => {
  console.log(`STYLESHOP працює: http://localhost:${config.port}`);
});

function shutdown(signal) {
  console.log(`${signal}: зупинка сервера`);
  server.close(() => { db.close(); process.exit(0); });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
