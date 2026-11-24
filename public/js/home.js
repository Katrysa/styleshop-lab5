'use strict';
/* home.js — головна сторінка: категорії та добірка товарів із даних сервера */
(function () {
  var Shop = window.Shop;
  var featured = document.getElementById('featured-list');
  var cats = document.getElementById('category-list');
  var errorBox = document.getElementById('home-error');
  if (!featured || !cats) { return; }

  function render() {
    errorBox.hidden = true;
    cats.innerHTML = Shop.categories().map(function (c) {
      return '<li><a class="category-card" href="catalog.html?cat=' + encodeURIComponent(c) + '">' + Shop.esc(c) + '</a></li>';
    }).join('');
    var marked = Shop.PRODUCTS.filter(function (p) { return p.badge; });
    var rest = Shop.PRODUCTS.filter(function (p) { return !p.badge; });
    featured.innerHTML = marked.concat(rest).slice(0, 4).map(Shop.renderCard).join('');
    Shop.syncFavs(featured);
  }
  function load() {
    Shop.ready.then(render).catch(function (err) {
      Shop.loadError(errorBox, err, function () { Shop.ready = Shop.load(); Shop.ready.catch(function () {}); load(); });
    });
  }
  load();
}());
