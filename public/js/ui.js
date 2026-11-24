'use strict';
/* ui.js — спільна поведінка сторінок: екранування даних, навігація, сповіщення, обране, лічильник кошика */
(function () {
  var Shop = window.Shop;
  var HEART = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.7 7.7 4 4.5 7.2 4.5c2 0 3.7 1.1 4.8 2.8 1.1-1.7 2.8-2.8 4.8-2.8 3.2 0 5.5 3.2 4.4 6.6-1.7 4.8-9.2 9.4-9.2 9.4z"/></svg>';

  Shop.$ = function (selector, root) { return (root || document).querySelector(selector); };
  Shop.$$ = function (selector, root) { return Array.prototype.slice.call((root || document).querySelectorAll(selector)); };

  /* Екранування: усі дані з сервера, що потрапляють у розмітку, проходять через цю функцію (захист від XSS) */
  Shop.esc = function (value) {
    return String(value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  };

  /* ---------- Сповіщення ---------- */
  var toastBox = null;
  Shop.toast = function (message, link) {
    if (!toastBox) {
      toastBox = document.createElement('div');
      toastBox.className = 'toast-box';
      toastBox.setAttribute('role', 'status');
      toastBox.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastBox);
    }
    var toast = document.createElement('div');
    toast.className = 'toast';
    var text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);
    if (link) {
      var a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.text;
      toast.appendChild(a);
    }
    toastBox.appendChild(toast);
    window.setTimeout(function () { toast.remove(); }, 4000);
  };

  /* Блок помилки завантаження з кнопкою повтору */
  Shop.loadError = function (box, err, retry) {
    box.hidden = false;
    box.innerHTML = '<h3>Не вдалося завантажити дані</h3><p>' + Shop.esc(err && err.message ? err.message : 'Невідома помилка') +
      '. Перевірте з’єднання та спробуйте ще раз.</p><button class="btn btn--outline" type="button">Спробувати ще раз</button>';
    Shop.$('button', box).addEventListener('click', retry);
  };

  /* ---------- Лічильник кошика ---------- */
  Shop.updateBadge = function () {
    var n = Shop.cart.count();
    Shop.$$('.cart-count').forEach(function (el) { el.textContent = n; el.hidden = n === 0; });
    Shop.$$('.js-cart-link').forEach(function (a) {
      a.setAttribute('aria-label', n ? 'Кошик, товарів: ' + n : 'Кошик порожній');
    });
  };

  /* ---------- Обране ---------- */
  function setFavButton(btn) {
    var id = btn.getAttribute('data-id');
    var product = Shop.byId(id);
    var on = Shop.favs.has(id);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', (on ? 'Прибрати з обраного: ' : 'Додати до обраного: ') + (product ? product.name : 'товар'));
  }
  Shop.syncFavs = function (root) { Shop.$$('.fav[data-id]', root).forEach(setFavButton); };

  document.addEventListener('click', function (event) {
    var btn = event.target.closest('.fav[data-id]');
    if (!btn) { return; }
    var product = Shop.byId(btn.getAttribute('data-id'));
    var added = Shop.favs.toggle(btn.getAttribute('data-id'));
    var name = product ? product.name : 'товар';
    Shop.toast((added ? 'Додано до обраного: ' : 'Прибрано з обраного: ') + name);
    Shop.syncFavs();
    document.dispatchEvent(new CustomEvent('shop:favchange'));
  });

  /* ---------- Картка товару (каталог, головна, схожі товари) ---------- */
  Shop.renderCard = function (p) {
    var badge = p.badge ? '<span class="badge">' + Shop.esc(p.badge) + '</span>' : '';
    var name = Shop.esc(p.name);
    return '<li><article class="product-card" data-id="' + Shop.esc(p.id) + '">' + badge +
      '<button class="fav" type="button" data-id="' + Shop.esc(p.id) + '" aria-pressed="false" aria-label="Додати до обраного: ' + name + '">' + HEART + '</button>' +
      '<figure><img src="img/' + Shop.esc(p.id) + '-1.svg" alt="' + name + ', колір ' + Shop.esc(p.colors[0].name.toLowerCase()) + '" width="400" height="500" loading="lazy"></figure>' +
      '<h3><a href="product.html?id=' + encodeURIComponent(p.id) + '">' + name + '</a></h3>' +
      '<p class="meta">' + Shop.esc(p.category) + ' · ' + Shop.esc(p.colors[0].name) + '</p>' +
      '<p class="price">' + Shop.money(p.price) + '</p></article></li>';
  };

  /* ---------- Навігація: меню на малих екранах ---------- */
  var toggle = Shop.$('.nav-toggle');
  var nav = Shop.$('#main-nav');
  var header = Shop.$('.site-header');
  function setMenu(open) {
    if (!toggle || !nav) { return; }
    nav.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (toggle && nav) {
    toggle.addEventListener('click', function () { setMenu(toggle.getAttribute('aria-expanded') !== 'true'); });
    nav.addEventListener('click', function (event) { if (event.target.closest('a')) { setMenu(false); } });
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('is-open')) { setMenu(false); toggle.focus(); }
    });
    document.addEventListener('click', function (event) {
      if (nav.classList.contains('is-open') && !header.contains(event.target)) { setMenu(false); }
    });
    window.addEventListener('resize', function () { if (window.innerWidth > 900) { setMenu(false); } });
  }
  function onScroll() { if (header) { header.classList.toggle('is-scrolled', window.scrollY > 10); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  Shop.updateBadge();
  Shop.ready.then(function () { Shop.syncFavs(); }, function () { /* помилку покаже сторінка */ });
}());
