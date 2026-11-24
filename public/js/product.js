'use strict';
/* product.js — картка товару: дані за адресою ?id=..., галерея, вибір кольору й розміру, додавання до кошика */
(function () {
  var Shop = window.Shop;
  var root = document.getElementById('product');
  if (!root) { return; }
  var $ = Shop.$;
  var notFound = document.getElementById('not-found');
  var errorBox = document.getElementById('load-error');
  var related = document.getElementById('related');
  var id = new URLSearchParams(window.location.search).get('id');

  function el(tag, attrs, html) {
    var node = document.createElement(tag);
    Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (html) { node.innerHTML = html; }
    return node;
  }
  function showNotFound() {
    root.hidden = true;
    related.hidden = true;
    notFound.hidden = false;
    document.title = 'Товар не знайдено — STYLESHOP';
  }

  function render(product) {
    var state = { color: 0, size: null };
    var mainPhoto = $('#main-photo'), thumbs = $('#p-thumbs'), colorsBox = $('#p-colors'), sizesBox = $('#p-sizes'), sizeError = $('#size-error');
    thumbs.innerHTML = ''; colorsBox.innerHTML = ''; sizesBox.innerHTML = '';

    document.title = product.name + ' — STYLESHOP';
    $('#p-cat').textContent = product.category;
    $('#p-title').textContent = product.name;
    $('#p-price').textContent = Shop.money(product.price);
    $('#p-desc').textContent = product.description;
    $('#p-info').textContent = product.info;
    $('#crumb-name').textContent = product.name;
    $('#crumb-cat').textContent = product.category;
    $('#crumb-cat').href = 'catalog.html?cat=' + encodeURIComponent(product.category);
    $('#p-fav').setAttribute('data-id', product.id);

    product.colors.forEach(function (c, i) {
      var wrap = el('span', {});
      wrap.appendChild(el('input', { 'class': 'visually-hidden', type: 'radio', name: 'color', id: 'c' + i, value: c.name }));
      wrap.appendChild(el('label', { 'class': 'pill', 'for': 'c' + i },
        '<span class="swatch" style="background:' + Shop.esc(c.hex) + '"></span><span class="visually-hidden">' + Shop.esc(c.name) + '</span>'));
      colorsBox.appendChild(wrap);
      thumbs.appendChild(el('button', { type: 'button', 'class': 'thumb', 'data-color': i, 'aria-pressed': 'false', 'aria-label': 'Показати фото: ' + c.name },
        '<img src="img/' + Shop.esc(product.id) + '-' + (i + 1) + '.svg" alt="" width="400" height="500">'));
    });
    Shop.SIZES.forEach(function (s) {
      var available = product.sizes.indexOf(s) !== -1;
      var wrap = el('span', {});
      var attrs = { 'class': 'visually-hidden', type: 'radio', name: 'size', id: 's-' + s, value: s };
      if (!available) { attrs.disabled = 'disabled'; }
      wrap.appendChild(el('input', attrs));
      wrap.appendChild(el('label', { 'class': 'pill', 'for': 's-' + s, title: available ? 'Розмір ' + s : 'Немає в наявності' }, s));
      sizesBox.appendChild(wrap);
    });

    function showColor(i) {
      state.color = i;
      var c = product.colors[i];
      mainPhoto.src = 'img/' + product.id + '-' + (i + 1) + '.svg';
      mainPhoto.alt = product.name + ', колір ' + c.name.toLowerCase();
      $('#p-color-name').textContent = c.name;
      $('#c' + i).checked = true;
      Shop.$$('.thumb', thumbs).forEach(function (t) { t.setAttribute('aria-pressed', Number(t.getAttribute('data-color')) === i ? 'true' : 'false'); });
    }
    showColor(0);
    colorsBox.onchange = function (e) { if (e.target.name === 'color') { showColor(Number(e.target.id.slice(1))); } };
    thumbs.onclick = function (e) { var t = e.target.closest('.thumb'); if (t) { showColor(Number(t.getAttribute('data-color'))); } };
    sizesBox.onchange = function (e) { state.size = e.target.value; sizeError.hidden = true; };

    var addBtn = $('#p-add');
    var timer = null;
    $('#p-form').onsubmit = function (e) {
      e.preventDefault();
      if (!state.size) {
        sizeError.textContent = 'Оберіть розмір, щоб додати товар до кошика';
        sizeError.hidden = false;
        var first = sizesBox.querySelector('input:not(:disabled)');
        if (first) { first.focus(); }
        return;
      }
      Shop.cart.add(product.id, state.size, product.colors[state.color].name, 1);
      Shop.updateBadge();
      Shop.toast('Додано до кошика: ' + product.name + ', ' + state.size, { href: 'cart.html', text: 'Перейти до кошика' });
      addBtn.textContent = 'Додано ✓';
      window.clearTimeout(timer);
      timer = window.setTimeout(function () { addBtn.textContent = 'Додати до кошика'; }, 1800);
    };

    var favBtn = $('#p-fav');
    function syncFavBtn() {
      var on = Shop.favs.has(product.id);
      favBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      favBtn.textContent = on ? 'Прибрати з обраного' : 'Додати до обраного';
    }
    favBtn.onclick = function () {
      var added = Shop.favs.toggle(product.id);
      Shop.toast((added ? 'Додано до обраного: ' : 'Прибрано з обраного: ') + product.name);
      syncFavBtn();
    };
    syncFavBtn();

    var others = Shop.PRODUCTS.filter(function (p) { return p.id !== product.id; }).slice(0, 3);
    $('#related-list').innerHTML = others.map(Shop.renderCard).join('');
    Shop.syncFavs($('#related-list'));
    root.hidden = false;
    related.hidden = others.length === 0;
  }

  function load() {
    errorBox.hidden = true;
    if (!id) { showNotFound(); return; }
    Shop.ready.then(function () {
      var product = Shop.byId(id);
      if (product) { render(product); } else { showNotFound(); }
    }).catch(function (err) {
      root.hidden = true;
      related.hidden = true;
      Shop.loadError(errorBox, err, function () { Shop.ready = Shop.load(); Shop.ready.catch(function () {}); load(); });
    });
  }
  load();
}());
