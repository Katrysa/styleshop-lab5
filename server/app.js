'use strict';
/* app.js — обробник HTTP-запитів: безпека, маршрутизація, розбір JSON, помилки, статичні файли */
const crypto = require('node:crypto');
const { HttpError } = require('./errors');
const { Router } = require('./router');
const security = require('./security');
const { serveStatic } = require('./static');
const svg = require('./svg');

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) { reject(new HttpError(413, 'payload_too_large', 'Запит перевищує допустимий розмір')); return; }
    const chunks = [];
    let size = 0;
    let tooLarge = false;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) { tooLarge = true; } else { chunks.push(chunk); }
    });
    req.on('end', () => (tooLarge
      ? reject(new HttpError(413, 'payload_too_large', 'Запит перевищує допустимий розмір'))
      : resolve(Buffer.concat(chunks).toString('utf8'))));
    req.on('error', reject);
  });
}

function createApp({ db, config }) {
  const limiter = security.createLimiter(config.rate.windowMs, config.rate.max);
  const writeLimiter = security.createLimiter(config.rate.windowMs, config.rate.writeMax);
  const authFails = security.createLimiter(config.rate.authWindowMs, config.rate.authFailMax);

  /* Проміжний обробник: пропускає лише адміністратора (токен зі змінної середовища ADMIN_TOKEN) */
  function admin(ctx) {
    if (!config.adminToken) { throw new HttpError(503, 'admin_disabled', 'Адміністрування вимкнено: не задано ADMIN_TOKEN'); }
    const state = authFails.blocked(ctx.ip);
    if (state.blocked) {
      ctx.res.setHeader('Retry-After', String(state.retryAfter));
      throw new HttpError(429, 'too_many_attempts', 'Забагато невдалих спроб входу. Спробуйте пізніше');
    }
    const token = security.bearerToken(ctx.req);
    if (!token || !security.safeEqual(token, config.adminToken)) {
      authFails.hit(ctx.ip);
      ctx.res.setHeader('WWW-Authenticate', 'Bearer');
      throw new HttpError(401, 'unauthorized', 'Потрібна авторизація адміністратора');
    }
  }

  const router = new Router();
  const deps = { db, config, admin };
  require('./routes/products')(router, deps);
  require('./routes/orders')(router, deps);
  require('./routes/forms')(router, deps);

  function sendJson(res, status, payload, headers) {
    const body = Buffer.from(JSON.stringify(payload));
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Length', body.length);
    Object.entries(headers || {}).forEach(([k, v]) => res.setHeader(k, v));
    res.end(body);
  }
  function sendError(res, err) {
    if (err instanceof HttpError) {
      const error = { code: err.code, message: err.message };
      if (err.fields) { error.fields = err.fields; }
      sendJson(res, err.status, { error });
    } else {
      console.error('Внутрішня помилка:', err);
      sendJson(res, 500, { error: { code: 'internal', message: 'Внутрішня помилка сервера' } });
    }
  }

  async function handleApi(req, res, url) {
    res.setHeader('Cache-Control', 'no-store');
    const ip = security.clientIp(req, config);
    const general = limiter.hit(ip);
    if (!general.allowed) { res.setHeader('Retry-After', String(general.retryAfter)); throw new HttpError(429, 'rate_limited', 'Забагато запитів. Спробуйте за хвилину'); }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const write = writeLimiter.hit(ip);
      if (!write.allowed) { res.setHeader('Retry-After', String(write.retryAfter)); throw new HttpError(429, 'rate_limited', 'Забагато запитів на зміну даних. Спробуйте за хвилину'); }
    }
    const match = router.match(req.method, url.pathname);
    if (!match) { throw new HttpError(404, 'not_found', 'Маршрут не знайдено'); }
    if (match.allowed) { res.setHeader('Allow', match.allowed.join(', ')); throw new HttpError(405, 'method_not_allowed', 'Метод не підтримується'); }

    let body;
    if (BODY_METHODS.has(req.method)) {
      if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
        throw new HttpError(415, 'unsupported_media_type', 'Очікується Content-Type: application/json');
      }
      const raw = await readBody(req, config.bodyLimit);
      try { body = raw ? JSON.parse(raw) : undefined; } catch (err) { throw new HttpError(400, 'bad_json', 'Некоректний JSON'); }
    }
    const params = {};
    for (const [k, v] of Object.entries(match.params)) {
      try { params[k] = decodeURIComponent(v); } catch (err) { throw new HttpError(400, 'bad_request', 'Некоректний шлях'); }
    }
    const ctx = {
      req, res, ip, params, body, query: url.searchParams,
      send: (status, payload, headers) => sendJson(res, status, payload, headers),
      sendEmpty: (status) => { res.statusCode = status; res.end(); },
    };
    for (const handler of match.handlers) {
      await handler(ctx);
      if (res.writableEnded) { break; }
    }
  }

  /* Зображення товарів генеруються сервером: /img/<id>-<номер кольору>.svg */
  function productImage(req, res, pathname) {
    const m = /^\/img\/([a-z0-9][a-z0-9-]{1,39})-([1-6])\.svg$/.exec(pathname);
    if (!m) { return false; }
    const product = db.getProduct(m[1]);
    const color = product && product.colors[Number(m[2]) - 1];
    if (!color) { return false; }
    const body = Buffer.from(svg.render(product.shape, color.hex));
    const etag = 'W/"' + crypto.createHash('sha1').update(body).digest('hex').slice(0, 16) + '"';
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) { res.statusCode = 304; res.end(); return true; }
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  async function handler(req, res) {
    const started = Date.now();
    try {
      security.applySecurityHeaders(req, res);
      let url;
      try { url = new URL(req.url, 'http://localhost'); } catch (err) { throw new HttpError(400, 'bad_request', 'Некоректний запит'); }
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        await handleApi(req, res, url);
      } else if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.setHeader('Allow', 'GET, HEAD');
        throw new HttpError(405, 'method_not_allowed', 'Метод не підтримується');
      } else if (!productImage(req, res, url.pathname)) {
        serveStatic(req, res, config.publicDir, url.pathname);
      }
    } catch (err) {
      if (!res.headersSent) { sendError(res, err); } else { res.end(); }
    } finally {
      if (config.log) {
        console.log(`${new Date().toISOString()} ${security.clientIp(req, config)} ${req.method} ${String(req.url).slice(0, 120)} ${res.statusCode} ${Date.now() - started}ms`);
      }
    }
  }
  return { handler };
}
module.exports = { createApp };
