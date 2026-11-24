'use strict';
/* store.js — сховище на стороні клієнта: безпечна робота з localStorage, кошик, обране */
(function () {
  var Shop = window.Shop;
  var memory = {};            // резервне сховище, якщо localStorage недоступний

  Shop.storage = {
    get: function (key, fallback) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw === null ? fallback : JSON.parse(raw);
      } catch (err) {
        return key in memory ? memory[key] : fallback;
      }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (err) { memory[key] = value; }
    }
  };

  Shop.byId = function (id) {
    return Shop.PRODUCTS.find(function (p) { return p.id === id; }) || null;
  };
  Shop.money = function (n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0') + '\u00A0₴';
  };

  /* ---------- Кошик: масив рядків { id, size, color, qty } ---------- */
  var CART_KEY = 'styleshop-cart';
  function readCart() {
    var raw = Shop.storage.get(CART_KEY, []);
    if (!Array.isArray(raw)) { return []; }
    return raw.filter(function (l) {
      return l && typeof l.id === 'string' && typeof l.size === 'string' && typeof l.color === 'string' && Number.isInteger(l.qty) && l.qty > 0;
    });
  }
  Shop.cart = {
    lines: readCart,
    add: function (id, size, color, qty) {
      var lines = readCart();
      var found = lines.find(function (l) { return l.id === id && l.size === size && l.color === color; });
      if (found) { found.qty = Math.min(Shop.MAX_QTY, found.qty + (qty || 1)); }
      else { lines.push({ id: id, size: size, color: color, qty: Math.min(Shop.MAX_QTY, qty || 1) }); }
      Shop.storage.set(CART_KEY, lines);
    },
    setQty: function (index, qty) {
      var lines = readCart();
      if (!lines[index]) { return; }
      lines[index].qty = Math.max(1, Math.min(Shop.MAX_QTY, Math.floor(Number(qty)) || 1));
      Shop.storage.set(CART_KEY, lines);
    },
    remove: function (index) {
      var lines = readCart();
      lines.splice(index, 1);
      Shop.storage.set(CART_KEY, lines);
    },
    /* Прибирає позиції, яких уже немає в каталозі; повертає кількість видалених */
    prune: function () {
      var lines = readCart();
      var kept = lines.filter(function (l) {
        var p = Shop.byId(l.id);
        return p && p.sizes.indexOf(l.size) !== -1 && p.colors.some(function (c) { return c.name === l.color; });
      });
      if (kept.length !== lines.length) { Shop.storage.set(CART_KEY, kept); }
      return lines.length - kept.length;
    },
    clear: function () { Shop.storage.set(CART_KEY, []); },
    count: function () { return readCart().reduce(function (sum, l) { return sum + l.qty; }, 0); },
    subtotal: function () {
      return readCart().reduce(function (sum, l) {
        var p = Shop.byId(l.id);
        return sum + (p ? l.qty * p.price : 0);
      }, 0);
    }
  };

  /* ---------- Обране: масив id товарів ---------- */
  var FAV_KEY = 'styleshop-fav';
  function readFavs() {
    var raw = Shop.storage.get(FAV_KEY, []);
    return Array.isArray(raw) ? raw.filter(function (id) { return typeof id === 'string'; }) : [];
  }
  Shop.favs = {
    all: readFavs,
    has: function (id) { return readFavs().indexOf(id) !== -1; },
    toggle: function (id) {
      var list = readFavs();
      var i = list.indexOf(id);
      if (i === -1) { list.push(id); } else { list.splice(i, 1); }
      Shop.storage.set(FAV_KEY, list);
      return i === -1;
    }
  };
}());
