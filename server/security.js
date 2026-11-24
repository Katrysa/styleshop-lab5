'use strict';
/* security.js — заголовки безпеки, обмеження частоти запитів, перевірка токена адміністратора */
const crypto = require('node:crypto');

const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'", "img-src 'self' data:",
  "font-src 'self'", "connect-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
].join('; ');

function applySecurityHeaders(req, res) {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  if (req.headers['x-forwarded-proto'] === 'https') {            // HSTS лише для HTTPS-з’єднань
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
}

function clientIp(req, config) {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) { return String(forwarded).split(',')[0].trim(); }
  }
  return req.socket.remoteAddress || 'unknown';
}

/* Лічильник «ключ → кількість звернень за вікно часу» */
function createLimiter(windowMs, max) {
  const hits = new Map();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) { if (entry.reset <= now) { hits.delete(key); } }
  }, Math.min(windowMs, 60_000));
  timer.unref();
  function entry(key) {
    const now = Date.now();
    let e = hits.get(key);
    if (!e || e.reset <= now) { e = { count: 0, reset: now + windowMs }; hits.set(key, e); }
    return e;
  }
  return {
    hit(key) {
      const e = entry(key);
      e.count += 1;
      return { allowed: e.count <= max, retryAfter: Math.max(1, Math.ceil((e.reset - Date.now()) / 1000)) };
    },
    blocked(key) {
      const e = entry(key);
      return { blocked: e.count >= max, retryAfter: Math.max(1, Math.ceil((e.reset - Date.now()) / 1000)) };
    },
  };
}

/* Порівняння токенів за постійний час (захист від атак за часом відповіді) */
function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function bearerToken(req) {
  const header = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(header);
  return m ? m[1].trim() : '';
}

module.exports = { applySecurityHeaders, clientIp, createLimiter, safeEqual, bearerToken };
