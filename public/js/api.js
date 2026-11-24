'use strict';
/* api.js — обгортка над Fetch API: JSON, тайм-аут, єдиний формат помилок (async/await + Promise) */
(function () {
  var Shop = window.Shop = window.Shop || {};
  var TIMEOUT_MS = 10000;

  function ApiError(status, code, message, fields) {
    this.name = 'ApiError';
    this.status = status;          // 0 — запит не дійшов до сервера
    this.code = code;
    this.message = message;
    this.fields = fields || null;  // помилки валідації по полях
  }
  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  async function request(method, url, body, token) {
    var controller = new AbortController();
    var timer = window.setTimeout(function () { controller.abort(); }, TIMEOUT_MS);
    var headers = { Accept: 'application/json' };
    var options = { method: method, headers: headers, signal: controller.signal };
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }
    if (token) { headers.Authorization = 'Bearer ' + token; }

    var response;
    try {
      response = await fetch(url, options);
    } catch (err) {
      var timeout = err && err.name === 'AbortError';
      throw new ApiError(0, timeout ? 'timeout' : 'network', timeout ? 'Сервер не відповів вчасно' : 'Немає зв’язку із сервером');
    } finally {
      window.clearTimeout(timer);
    }

    var data = null;
    if (response.status !== 204) {
      try { data = await response.json(); } catch (err) { data = null; }
    }
    if (!response.ok) {
      var e = (data && data.error) || {};
      throw new ApiError(response.status, e.code || 'http_' + response.status, e.message || 'Помилка сервера (' + response.status + ')', e.fields);
    }
    return data;
  }

  Shop.ApiError = ApiError;
  Shop.api = {
    get: function (url, token) { return request('GET', url, undefined, token); },
    post: function (url, body, token) { return request('POST', url, body, token); },
    put: function (url, body, token) { return request('PUT', url, body, token); },
    patch: function (url, body, token) { return request('PATCH', url, body, token); },
    del: function (url, token) { return request('DELETE', url, undefined, token); }
  };
}());
