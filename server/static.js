'use strict';
/* static.js — роздача файлів клієнтської частини: захист від виходу за межі каталогу, ETag, gzip, кешування */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8', '.webmanifest': 'application/manifest+json',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt']);
const gzCache = new Map();

function resolveFile(publicDir, pathname) {
  let decoded;
  try { decoded = decodeURIComponent(pathname); } catch (err) { return { status: 400 }; }
  if (decoded.includes('\0')) { return { status: 400 }; }
  const parts = decoded.split('/').filter(Boolean);
  if (parts.some((p) => p.startsWith('.') || p === '..')) { return { status: 404 };}   // приховані файли та ".."
  let file = path.join(publicDir, ...parts);
  if (!file.startsWith(publicDir + path.sep) && file !== publicDir) { return { status: 404 }; }
  try {
    if (fs.statSync(file).isDirectory()) { file = path.join(file, 'index.html'); }
    return { status: 200, file, stat: fs.statSync(file) };
  } catch (err) {
    return { status: 404 };
  }
}

function send(req, res, file, stat, status) {
  const ext = path.extname(file).toLowerCase();
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  res.setHeader('Content-Type', TYPES[ext] || 'application/octet-stream');
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', ext === '.html' ? 'no-cache' : 'public, max-age=3600');
  res.setHeader('Vary', 'Accept-Encoding');
  if (status === 200 && req.headers['if-none-match'] === etag) { res.statusCode = 304; res.end(); return; }
  let body = fs.readFileSync(file);
  if (COMPRESSIBLE.has(ext) && body.length > 1024 && /\bgzip\b/.test(req.headers['accept-encoding'] || '')) {
    const key = file + etag;
    if (!gzCache.has(key)) { gzCache.set(key, zlib.gzipSync(body)); }
    body = gzCache.get(key);
    res.setHeader('Content-Encoding', 'gzip');
  }
  res.statusCode = status;
  res.setHeader('Content-Length', body.length);
  res.end(req.method === 'HEAD' ? undefined : body);
}

function serveStatic(req, res, publicDir, pathname) {
  const found = resolveFile(publicDir, pathname);
  if (found.status === 200) { return send(req, res, found.file, found.stat, 200); }
  const notFoundPage = path.join(publicDir, '404.html');
  if (found.status === 404 && fs.existsSync(notFoundPage)) { return send(req, res, notFoundPage, fs.statSync(notFoundPage), 404); }
  res.statusCode = found.status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(found.status === 400 ? 'Некоректний запит' : 'Не знайдено');
  return undefined;
}
module.exports = { serveStatic };
