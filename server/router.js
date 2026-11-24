'use strict';
/* router.js — простий маршрутизатор за зразком Express: метод + шлях із параметрами + ланцюжок обробників */
class Router {
  constructor() { this.routes = []; }

  add(method, pattern, ...handlers) {
    const keys = [];
    const source = pattern.replace(/\/:([A-Za-z_]+)/g, (_, key) => { keys.push(key); return '/([^/]+)'; });
    this.routes.push({ method, re: new RegExp('^' + source + '/?$'), keys, handlers });
    return this;
  }
  get(p, ...h) { return this.add('GET', p, ...h); }
  post(p, ...h) { return this.add('POST', p, ...h); }
  put(p, ...h) { return this.add('PUT', p, ...h); }
  patch(p, ...h) { return this.add('PATCH', p, ...h); }
  delete(p, ...h) { return this.add('DELETE', p, ...h); }

  /* Повертає { handlers, params } або { allowed: [...] } (шлях є, але метод інший), або null */
  match(method, pathname) {
    const allowed = [];
    for (const r of this.routes) {
      const m = r.re.exec(pathname);
      if (!m) { continue; }
      if (r.method !== method) { allowed.push(r.method); continue; }
      const params = {};
      r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
      return { handlers: r.handlers, params };
    }
    return allowed.length ? { allowed } : null;
  }
}
module.exports = { Router };
