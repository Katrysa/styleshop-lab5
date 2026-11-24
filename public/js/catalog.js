'use strict';
/* catalog.js — каталог: завантаження з API, пошук, фільтри, сортування */
(function () {
  var Shop = window.Shop;
  var form = document.getElementById('filters');
  var list = document.getElementById('product-list');
  if (!form || !list) { return; }
  var searchForm = document.getElementById('search');
  var searchInput = document.getElementById('q');
  var sortSelect = document.getElementById('sort');
  var counter = document.getElementById('result-count');
  var emptyBox = document.getElementById('empty');
  var priceError = document.getElementById('price-error');
  var loadState = document.getElementById('load-state');
  var errorBox = document.getElementById('load-error');

  function checked(name) { return Shop.$$('input[name="' + name + '"]:checked', form).map(function (i) { return i.value; }); }
  function toNumber(v) { return v === '' || isNaN(Number(v)) ? null : Number(v); }
  function readState() {
    return {
      cats: checked('category'), sizes: checked('size'), colors: checked('color'),
      min: toNumber(form.elements.min.value), max: toNumber(form.elements.max.value), fav: form.elements.fav.checked,
      q: searchInput.value.trim().toLowerCase(), sort: sortSelect.value
    };
  }
  function matches(p, s) {
    if (s.cats.length && s.cats.indexOf(p.category) === -1) { return false; }
    if (s.sizes.length && !s.sizes.some(function (z) { return p.sizes.indexOf(z) !== -1; })) { return false; }
    if (s.colors.length && !p.colors.some(function (c) { return s.colors.indexOf(c.name) !== -1; })) { return false; }
    if (s.min !== null && p.price < s.min) { return false; }
    if (s.max !== null && p.price > s.max) { return false; }
    if (s.fav && !Shop.favs.has(p.id)) { return false; }
    if (s.q && (p.name + ' ' + p.category).toLowerCase().indexOf(s.q) === -1) { return false; }
    return true;
  }
  var SORTERS = {
    'price-asc': function (a, b) { return a.price - b.price; },
    'price-desc': function (a, b) { return b.price - a.price; },
    'name': function (a, b) { return a.name.localeCompare(b.name, 'uk'); }
  };
  function plural(n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) { return 'товар'; }
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) { return 'товари'; }
    return 'товарів';
  }

  function render() {
    var s = readState();
    var rangeBroken = s.min !== null && s.max !== null && s.min > s.max;
    priceError.textContent = rangeBroken ? 'Мінімальна ціна не може бути більшою за максимальну' : '';
    priceError.hidden = !rangeBroken;
    if (rangeBroken) { s.min = null; s.max = null; }
    var items = Shop.PRODUCTS.filter(function (p) { return matches(p, s); });
    if (SORTERS[s.sort]) { items.sort(SORTERS[s.sort]); }
    list.innerHTML = items.map(Shop.renderCard).join('');
    Shop.syncFavs(list);
    counter.textContent = 'Знайдено: ' + items.length + ' ' + plural(items.length);
    emptyBox.hidden = items.length > 0;
  }

  /* Списки категорій і кольорів будуються з даних, отриманих від сервера */
  function buildFilters() {
    function boxes(name, values) {
      return values.map(function (v) {
        return '<label class="check"><input type="checkbox" name="' + name + '" value="' + Shop.esc(v) + '"> ' + Shop.esc(v) + '</label>';
      }).join('');
    }
    document.getElementById('cat-filters').innerHTML = boxes('category', Shop.categories());
    document.getElementById('color-filters').innerHTML = boxes('color', Shop.colorNames());
  }

  function resetAll() {
    form.reset();
    searchInput.value = '';
    sortSelect.value = 'default';
    window.setTimeout(render, 0);
  }

  function init() {
    loadState.hidden = true;
    errorBox.hidden = true;
    buildFilters();
    var params = new URLSearchParams(window.location.search);
    var cat = params.get('cat');
    if (cat) { Shop.$$('input[name="category"]', form).forEach(function (i) { i.checked = i.value === cat; }); }
    if (params.get('q')) { searchInput.value = params.get('q'); }
    if (params.get('fav') === '1') { form.elements.fav.checked = true; }
    render();
  }
  function load() {
    loadState.hidden = false;
    errorBox.hidden = true;
    list.innerHTML = '';
    Shop.ready.then(init).catch(function (err) {
      loadState.hidden = true;
      counter.textContent = '';
      Shop.loadError(errorBox, err, function () { Shop.ready = Shop.load(); Shop.ready.catch(function () {}); load(); });
    });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  form.addEventListener('change', render);
  form.addEventListener('input', function (e) { if (e.target.type === 'number') { render(); } });
  form.addEventListener('reset', function () { window.setTimeout(render, 0); });
  searchForm.addEventListener('submit', function (e) { e.preventDefault(); render(); });
  searchInput.addEventListener('input', render);
  sortSelect.addEventListener('change', render);
  document.getElementById('empty-reset').addEventListener('click', resetAll);
  document.addEventListener('shop:favchange', function () { if (form.elements.fav.checked) { render(); } });
  load();
}());
