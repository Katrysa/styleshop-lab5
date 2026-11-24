'use strict';
/* data.js — завантаження каталогу та налаштувань магазину з REST API (замість статичного масиву) */
(function () {
  var Shop = window.Shop;
  Shop.PRODUCTS = [];
  Shop.SIZES = ['XS', 'S', 'M', 'L', 'XL'];
  Shop.FREE_FROM = 2000;
  Shop.MAX_QTY = 10;
  Shop.DELIVERY = {};

  /* Повертає Promise; сторінки чекають на нього через Shop.ready.then(...) */
  Shop.load = function () {
    return Promise.all([Shop.api.get('/api/config'), Shop.api.get('/api/products')]).then(function (res) {
      Shop.FREE_FROM = res[0].freeFrom;
      Shop.MAX_QTY = res[0].maxQty;
      Shop.SIZES = res[0].sizes;
      Shop.DELIVERY = res[0].delivery;
      Shop.PRODUCTS = res[1];
      return Shop;
    });
  };
  Shop.categories = function () {
    var seen = [];
    Shop.PRODUCTS.forEach(function (p) { if (seen.indexOf(p.category) === -1) { seen.push(p.category); } });
    return seen;
  };
  Shop.colorNames = function () {
    var seen = [];
    Shop.PRODUCTS.forEach(function (p) { p.colors.forEach(function (c) { if (seen.indexOf(c.name) === -1) { seen.push(c.name); } }); });
    return seen;
  };

  /* Дані потрібні лише сторінкам із атрибутом data-catalog на <body> */
  if (document.body.hasAttribute('data-catalog')) {
    Shop.ready = Shop.load();
    Shop.ready.catch(function () { /* помилку показує сторінка через Shop.ready.catch */ });
  } else {
    Shop.ready = Promise.resolve(Shop);
  }
}());
