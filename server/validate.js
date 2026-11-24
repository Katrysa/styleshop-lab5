'use strict';
/* validate.js — серверна валідація вхідних даних (клієнтській перевірці не довіряємо) */
const { HttpError } = require('./errors');
const SHAPE_KEYS = require('./svg').SHAPE_KEYS;

const NAME_RE = /^[\p{L}][\p{L}'’\- ]*$/u;
const CTRL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function fail(fields) { throw new HttpError(400, 'validation', 'Дані не пройшли перевірку', fields); }
const text = (v) => (typeof v === 'string' ? v.trim() : '');
const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function plainObject(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) { fail({ _: 'Очікується JSON-об’єкт' }); }
  return body;
}

function personName(value, label, errors, key) {
  const v = text(value);
  if (!v) { errors[key] = `Введіть ${label}`; return ''; }
  if (v.length < 2) { errors[key] = 'Мінімум 2 символи'; return ''; }
  if (v.length > 50) { errors[key] = 'Максимум 50 символів'; return ''; }
  if (!NAME_RE.test(v)) { errors[key] = 'Лише літери, пробіл, дефіс та апостроф'; return ''; }
  return v;
}
function email(value, errors, key) {
  const v = text(value);
  if (!v) { errors[key] = 'Введіть адресу електронної пошти'; return ''; }
  if (v.length > 120 || !EMAIL_RE.test(v)) { errors[key] = 'Некоректна адреса електронної пошти'; return ''; }
  return v.toLowerCase();
}
function plain(value, key, min, max, errors, label) {
  const v = text(value);
  if (v.length < min) { errors[key] = min ? `${label}: мінімум ${min} символів` : ''; if (!min) { delete errors[key]; } return v; }
  if (v.length > max) { errors[key] = `${label}: максимум ${max} символів`; return v; }
  if (CTRL_RE.test(v)) { errors[key] = `${label}: містить недопустимі символи`; return v; }
  return v;
}

/* ---------- підписка та повідомлення ---------- */
function subscriber(body) {
  plainObject(body);
  const errors = {};
  const value = { email: email(body.email, errors, 'email') };
  if (Object.keys(errors).length) { fail(errors); }
  return value;
}
function message(body) {
  plainObject(body);
  const errors = {};
  const value = {
    name: personName(body.name, 'ім’я', errors, 'name'),
    email: email(body.email, errors, 'email'),
    message: plain(body.message, 'message', 10, 1000, errors, 'Повідомлення'),
  };
  if (Object.keys(errors).length) { fail(errors); }
  return value;
}

/* ---------- товар ---------- */
function product(body, config, { withId }) {
  plainObject(body);
  const errors = {};
  const value = {};
  if (withId) {
    value.id = text(body.id);
    if (!ID_RE.test(value.id)) { errors.id = 'Ідентифікатор: 2–40 символів, малі латинські літери, цифри та дефіс'; }
  }
  value.name = plain(body.name, 'name', 2, 80, errors, 'Назва');
  value.category = plain(body.category, 'category', 2, 30, errors, 'Категорія');
  const price = body.price;
  if (!Number.isInteger(price) || price < 1 || price > 1_000_000) { errors.price = 'Ціна — ціле число від 1 до 1 000 000'; }
  value.price = price;
  value.badge = plain(body.badge === undefined ? '' : body.badge, 'badge', 0, 20, errors, 'Позначка');
  value.description = plain(body.description === undefined ? '' : body.description, 'description', 0, 300, errors, 'Опис');
  value.info = plain(body.info === undefined ? '' : body.info, 'info', 0, 600, errors, 'Деталі');
  value.shape = SHAPE_KEYS.includes(body.shape) ? body.shape : 'tshirt';
  if (body.shape !== undefined && !SHAPE_KEYS.includes(body.shape)) { errors.shape = 'Невідома форма зображення'; }

  const colors = Array.isArray(body.colors) ? body.colors : [];
  if (colors.length < 1 || colors.length > 6) { errors.colors = 'Потрібно від 1 до 6 кольорів'; }
  value.colors = [];
  colors.slice(0, 6).forEach((c) => {
    const n = text(c && c.name);
    if (n.length < 2 || n.length > 20 || CTRL_RE.test(n)) { errors.colors = 'Назва кольору: 2–20 символів'; }
    else if (!c || !HEX_RE.test(c.hex)) { errors.colors = 'Колір задається у форматі #RRGGBB'; }
    else { value.colors.push({ name: n, hex: c.hex.toUpperCase() }); }
  });
  const sizes = Array.isArray(body.sizes) ? body.sizes : [];
  const okSizes = config.sizes.filter((s) => sizes.includes(s));
  if (!okSizes.length || okSizes.length !== new Set(sizes).size) { errors.sizes = `Оберіть розміри зі списку: ${config.sizes.join(', ')}`; }
  value.sizes = okSizes;
  if (Object.keys(errors).length) { fail(errors); }
  return value;
}

/* ---------- замовлення ---------- */
function order(body, config, findProduct) {
  plainObject(body);
  const errors = {};
  const phoneRaw = text(body.phone).replace(/[\s()\-]/g, '');
  let phone = '';
  if (!phoneRaw) { errors.phone = 'Введіть номер телефону'; }
  else if (!/^(\+38)?0\d{9}$/.test(phoneRaw)) { errors.phone = 'Формат: +380XXXXXXXXX або 0XXXXXXXXX'; }
  else { phone = phoneRaw.startsWith('+38') ? phoneRaw : '+38' + phoneRaw; }

  const value = {
    first_name: personName(body.first_name, 'ім’я', errors, 'first_name'),
    last_name: personName(body.last_name, 'прізвище', errors, 'last_name'),
    phone,
    email: email(body.email, errors, 'email'),
    address: plain(body.address, 'address', 5, 200, errors, 'Адреса'),
    note: plain(body.note === undefined ? '' : body.note, 'note', 0, 300, errors, 'Коментар'),
    delivery: body.delivery,
    payment: body.payment,
  };
  if (!has(config.delivery, value.delivery)) { errors.delivery = 'Оберіть спосіб доставки'; }
  if (!has(config.payments, value.payment)) { errors.payment = 'Оберіть спосіб оплати'; }
  if (body.agree !== true) { errors.agree = 'Потрібна згода на обробку персональних даних'; }

  const items = [];
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 30) {
    errors.items = 'Кошик порожній або містить забагато позицій';
  } else {
    for (const raw of body.items) {
      const it = raw && typeof raw === 'object' ? raw : {};
      const prod = typeof it.productId === 'string' ? findProduct(it.productId) : null;
      if (!prod) { errors.items = 'Один із товарів більше недоступний'; break; }
      if (!prod.sizes.includes(it.size)) { errors.items = `Розмір ${String(it.size).slice(0, 5)} недоступний для «${prod.name}»`; break; }
      if (!prod.colors.some((c) => c.name === it.color)) { errors.items = `Колір недоступний для «${prod.name}»`; break; }
      if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > config.maxQty) { errors.items = `Кількість — від 1 до ${config.maxQty}`; break; }
      items.push({ product: prod, size: it.size, color: it.color, qty: it.qty });
    }
  }
  if (Object.keys(errors).length) { fail(errors); }
  value.items = items;
  return value;
}

function status(body, config) {
  plainObject(body);
  if (!config.orderStatuses.includes(body.status)) {
    fail({ status: `Допустимі значення: ${config.orderStatuses.join(', ')}` });
  }
  return { status: body.status };
}

module.exports = { subscriber, message, product, order, status };
