'use strict';
/* admin.js — панель адміністратора: CRUD товарів, замовлення, повідомлення (токен — у sessionStorage) */
(function () {
  var Shop = window.Shop;
  var $ = Shop.$, esc = Shop.esc;
  var KEY = 'styleshop-admin-token';
  var STATUS = { 'new': 'Нове', confirmed: 'Підтверджено', shipped: 'Відправлено', delivered: 'Доставлено', cancelled: 'Скасовано' };
  var LABELS = { id: 'Ідентифікатор', name: 'Назва', category: 'Категорія', price: 'Ціна', badge: 'Позначка', description: 'Опис', info: 'Деталі', shape: 'Форма', colors: 'Кольори', sizes: 'Розміри' };
  var token = '';
  try { token = window.sessionStorage.getItem(KEY) || ''; } catch (err) { token = ''; }
  var editingId = null;

  var loginBox = $('#login'), panel = $('#panel'), loginError = $('#login-error');

  /* Запит із токеном; при 401 повертаємо на форму входу */
  async function call(method, url, body) {
    try {
      var fn = { GET: 'get', POST: 'post', PUT: 'put', PATCH: 'patch', DELETE: 'del' }[method];
      return method === 'GET' || method === 'DELETE' ? await Shop.api[fn](url, token) : await Shop.api[fn](url, body, token);
    } catch (err) {
      if (err.status === 401) { logout('Токен недійсний або сесія завершилась'); }
      throw err;
    }
  }
  function logout(message) {
    token = '';
    try { window.sessionStorage.removeItem(KEY); } catch (err) { /* ігноруємо */ }
    panel.hidden = true;
    loginBox.hidden = false;
    loginError.textContent = message || '';
    loginError.hidden = !message;
  }

  /* ---------- Товари ---------- */
  async function loadProducts() {
    var list = await Shop.api.get('/api/products');
    $('#products-body').innerHTML = list.map(function (p) {
      return '<tr><td>' + esc(p.id) + '</td><td>' + esc(p.name) + '</td><td>' + esc(p.category) + '</td><td>' + Shop.money(p.price) + '</td>' +
        '<td><button class="link-btn" type="button" data-act="edit" data-id="' + esc(p.id) + '">Змінити</button> · ' +
        '<button class="link-btn" type="button" data-act="delete" data-id="' + esc(p.id) + '">Видалити<span class="visually-hidden">: ' + esc(p.name) + '</span></button></td></tr>';
    }).join('');
    Shop.products = list;
  }

  var pf = $('#product-form');
  function fillSizes(selected) {
    $('#pf-sizes').innerHTML = ['XS', 'S', 'M', 'L', 'XL'].map(function (s) {
      return '<label class="check"><input type="checkbox" name="sizes" value="' + s + '"' + (selected.indexOf(s) !== -1 ? ' checked' : '') + '> ' + s + '</label>';
    }).join('');
  }
  function fillColors(colors) {
    var rows = '';
    for (var i = 0; i < 3; i += 1) {
      var c = colors[i] || { name: '', hex: '#C9B79C' };
      rows += '<div class="price-range"><label class="visually-hidden" for="pc-n' + i + '">Назва кольору ' + (i + 1) + '</label>' +
        '<input type="text" id="pc-n' + i + '" class="pf-cname" maxlength="20" value="' + esc(c.name) + '" placeholder="Назва кольору ' + (i + 1) + '">' +
        '<label class="visually-hidden" for="pc-h' + i + '">Відтінок ' + (i + 1) + '</label><input type="color" id="pc-h' + i + '" class="pf-chex" value="' + esc(c.hex.toLowerCase()) + '"></div>';
    }
    $('#pf-colors').innerHTML = rows;
  }
  function openForm(product) {
    editingId = product ? product.id : null;
    var p = product || { id: '', name: '', category: '', price: '', badge: '', shape: 'tshirt', description: '', info: '', colors: [], sizes: ['M'] };
    $('#pf-title').textContent = product ? 'Змінити товар' : 'Новий товар';
    $('#pf-id').value = p.id; $('#pf-id').readOnly = !!product;
    $('#pf-name').value = p.name; $('#pf-category').value = p.category; $('#pf-price').value = p.price;
    $('#pf-badge').value = p.badge; $('#pf-shape').value = p.shape; $('#pf-description').value = p.description; $('#pf-info').value = p.info;
    fillColors(p.colors); fillSizes(p.sizes);
    $('#pf-errors').hidden = true;
    pf.hidden = false;
    $('#pf-name').focus();
  }
  function payload() {
    var names = Shop.$$('.pf-cname', pf), hexes = Shop.$$('.pf-chex', pf), colors = [];
    names.forEach(function (n, i) { if (n.value.trim()) { colors.push({ name: n.value.trim(), hex: hexes[i].value }); } });
    var price = $('#pf-price').value.trim();
    return {
      id: $('#pf-id').value.trim(), name: $('#pf-name').value, category: $('#pf-category').value, price: price === '' ? null : Number(price),
      badge: $('#pf-badge').value, shape: $('#pf-shape').value, description: $('#pf-description').value, info: $('#pf-info').value,
      colors: colors, sizes: Shop.$$('input[name="sizes"]:checked', pf).map(function (c) { return c.value; })
    };
  }
  pf.addEventListener('submit', async function (e) {
    e.preventDefault();
    var data = payload();
    var errors = $('#pf-errors');
    try {
      if (editingId) { delete data.id; await call('PUT', '/api/products/' + encodeURIComponent(editingId), data); }
      else { await call('POST', '/api/products', data); }
      Shop.toast(editingId ? 'Товар оновлено' : 'Товар створено');
      pf.hidden = true;
      await loadProducts();
    } catch (err) {
      var items = err.fields ? Object.keys(err.fields).map(function (k) { return (LABELS[k] || k) + ': ' + err.fields[k]; }) : [err.message];
      errors.innerHTML = items.map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
      errors.hidden = false;
    }
  });
  $('#pf-cancel').addEventListener('click', function () { pf.hidden = true; });
  $('#new-product').addEventListener('click', function () { openForm(null); });
  $('#products-body').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-act]');
    if (!btn) { return; }
    var id = btn.getAttribute('data-id');
    if (btn.getAttribute('data-act') === 'edit') {
      openForm((Shop.products || []).find(function (p) { return p.id === id; }));
    } else if (window.confirm('Видалити товар «' + id + '»? Цю дію не можна скасувати.')) {
      try { await call('DELETE', '/api/products/' + encodeURIComponent(id)); Shop.toast('Товар видалено'); await loadProducts(); }
      catch (err) { Shop.toast('Не вдалося видалити: ' + err.message); }
    }
  });

  /* ---------- Замовлення ---------- */
  async function loadOrders() {
    var list = await call('GET', '/api/orders');
    $('#orders-empty').hidden = list.length > 0;
    $('#orders-body').innerHTML = list.map(function (o) {
      var items = o.items.map(function (i) { return esc(i.name) + ' (' + esc(i.color) + ', ' + esc(i.size) + ') × ' + i.qty; }).join('<br>');
      var options = Object.keys(STATUS).map(function (k) { return '<option value="' + k + '"' + (k === o.status ? ' selected' : '') + '>' + STATUS[k] + '</option>'; }).join('');
      return '<tr><td>' + esc(o.number) + '<br><span class="muted">' + esc(o.created_at) + '</span></td>' +
        '<td>' + esc(o.first_name) + ' ' + esc(o.last_name) + '<br><span class="muted">' + esc(o.phone) + '<br>' + esc(o.email) + '<br>' + esc(o.address) + '</span></td>' +
        '<td>' + items + '</td><td>' + Shop.money(o.total) + '</td>' +
        '<td><label class="visually-hidden" for="st-' + o.id + '">Статус ' + esc(o.number) + '</label><select id="st-' + o.id + '" data-order="' + o.id + '">' + options + '</select></td>' +
        '<td><button class="link-btn" type="button" data-del-order="' + o.id + '">Видалити<span class="visually-hidden">: ' + esc(o.number) + '</span></button></td></tr>';
    }).join('');
  }
  $('#orders-body').addEventListener('change', async function (e) {
    var sel = e.target.closest('select[data-order]');
    if (!sel) { return; }
    try { await call('PATCH', '/api/orders/' + sel.getAttribute('data-order'), { status: sel.value }); Shop.toast('Статус замовлення оновлено'); }
    catch (err) { Shop.toast('Не вдалося змінити статус: ' + err.message); await loadOrders(); }
  });
  $('#orders-body').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-del-order]');
    if (!btn || !window.confirm('Видалити замовлення назавжди?')) { return; }
    try { await call('DELETE', '/api/orders/' + btn.getAttribute('data-del-order')); Shop.toast('Замовлення видалено'); await loadOrders(); }
    catch (err) { Shop.toast('Не вдалося видалити: ' + err.message); }
  });

  /* ---------- Повідомлення та підписники ---------- */
  async function loadMessages() {
    var list = await call('GET', '/api/messages');
    $('#messages-empty').hidden = list.length > 0;
    $('#messages-body').innerHTML = list.map(function (m) {
      return '<li class="card-box"><p><strong>' + esc(m.name) + '</strong> · <a href="mailto:' + esc(m.email) + '">' + esc(m.email) + '</a> · <span class="muted">' + esc(m.created_at) + '</span></p>' +
        '<p>' + esc(m.message) + '</p><button class="link-btn" type="button" data-del-msg="' + m.id + '">Видалити<span class="visually-hidden"> повідомлення від ' + esc(m.name) + '</span></button></li>';
    }).join('');
    var subs = await call('GET', '/api/subscribers');
    $('#subs-body').innerHTML = subs.map(function (s) { return '<li>' + esc(s.email) + '</li>'; }).join('');
    $('#subs-count').textContent = subs.length;
  }
  $('#messages-body').addEventListener('click', async function (e) {
    var btn = e.target.closest('[data-del-msg]');
    if (!btn || !window.confirm('Видалити повідомлення?')) { return; }
    try { await call('DELETE', '/api/messages/' + btn.getAttribute('data-del-msg')); await loadMessages(); }
    catch (err) { Shop.toast('Не вдалося видалити: ' + err.message); }
  });

  /* ---------- Вкладки ---------- */
  var loaders = { products: loadProducts, orders: loadOrders, messages: loadMessages };
  async function showTab(name) {
    Shop.$$('[role="tab"]').forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-tab') === name ? 'true' : 'false'); });
    Shop.$$('[role="tabpanel"]').forEach(function (p) { p.hidden = p.id !== 'tab-' + name; });
    try { await loaders[name](); } catch (err) { if (err.status !== 401) { Shop.toast('Не вдалося завантажити дані: ' + err.message); } }
  }
  Shop.$$('[role="tab"]').forEach(function (t) { t.addEventListener('click', function () { showTab(t.getAttribute('data-tab')); }); });

  /* ---------- Вхід ---------- */
  async function enter() {
    loginBox.hidden = true;
    panel.hidden = false;
    await showTab('products');
  }
  $('#login-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var value = $('#token').value.trim();
    if (!value) { loginError.textContent = 'Введіть токен адміністратора'; loginError.hidden = false; return; }
    token = value;
    try {
      await Shop.api.get('/api/orders', token);          // перевірка токена
      try { window.sessionStorage.setItem(KEY, token); } catch (err) { /* ігноруємо */ }
      $('#token').value = '';
      loginError.hidden = true;
      await enter();
    } catch (err) {
      token = '';
      loginError.textContent = err.status === 401 ? 'Невірний токен' : (err.status === 503 ? err.message : (err.status === 429 ? err.message : 'Не вдалося увійти: ' + err.message));
      loginError.hidden = false;
    }
  });
  $('#logout').addEventListener('click', function () { logout(''); });
  if (token) { enter(); }
}());
