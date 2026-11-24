'use strict';
/* config.js — налаштування застосунку; секрети беруться зі змінних середовища */
const fs = require('node:fs');
const path = require('node:path');

const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile) && typeof process.loadEnvFile === 'function') {
  process.loadEnvFile(envFile);               // локальна розробка: змінні з файлу .env
}

module.exports = {
  port: Number(process.env.PORT) || 3000,
  host: process.env.HOST || '0.0.0.0',
  dbPath: process.env.DB_PATH || path.join(__dirname, '..', 'data', 'styleshop.db'),
  adminToken: process.env.ADMIN_TOKEN || '',
  trustProxy: process.env.TRUST_PROXY === '1',   // 1 — застосунок працює за проксі хмарної платформи
  publicDir: path.join(__dirname, '..', 'public'),
  bodyLimit: 100 * 1024,                          // максимальний розмір тіла запиту, байт
  log: process.env.LOG !== 'off',
  rate: { windowMs: 60_000, max: Number(process.env.RATE_MAX) || 240, writeMax: 20, authFailMax: 10, authWindowMs: 600_000 },
  freeFrom: 2000,
  maxQty: 10,
  sizes: ['XS', 'S', 'M', 'L', 'XL'],
  delivery: {
    np: { name: 'Нова пошта', price: 70 },
    up: { name: 'Укрпошта', price: 45 },
    pickup: { name: 'Самовивіз із магазину', price: 0 },
  },
  payments: { card: 'Карткою онлайн', cod: 'Під час отримання' },
  orderStatuses: ['new', 'confirmed', 'shipped', 'delivered', 'cancelled'],
};
