'use strict';
/* cart.js — кошик і оформлення замовлення: відображення позицій, підсумок, надсилання замовлення на сервер */
(function () {
  var Shop = window.Shop;
  var body = document.getElementById('cart-body');
  if (!body) { return; }
  var layout = document.getElementById('cart-layout');
  var emptyBox = document.getElementById('cart-empty');
  var doneBox = document.getElementById('order-done');
  var errorBox = document.getElementById('load-error');
  var notice = document.getElementById('cart-notice');
  var orderForm = document.getElementById('order-form');
  var lastFocus = null;

  function deliveryChoice() {
    var checked = orderForm.querySelector('input[name="delivery"]:checked');
    return checked ? checked.value : 'np';
  }
  /* Лише для відображення: остаточну суму завжди рахує сервер */
  function deliveryCost(subtotal) {
    var key = deliveryChoice();
    if (key === 'pickup' || subtotal >= Shop.FREE_FROM) { return 0; }
    return Shop.DELIVERY[key] ? Shop.DELIVERY[key].price : 0;
  }

  function rowHTML(line, index) {
    var p = Shop.byId(line.id);
    var name = Shop.esc(p.name);
    var colorIndex = Math.max(0, p.colors.findIndex(function (c) { return c.name === line.color; }));
    return '<tr data-index="' + index + '">' +
      '<td><div class="cart-item"><img src="img/' + Shop.esc(p.id) + '-' + (colorIndex + 1) + '.svg" alt="" width="80" height="100"><div>' +
      '<a href="product.html?id=' + encodeURIComponent(p.id) + '"><strong>' + name + '</strong></a><br><span class="muted">' + Shop.esc(line.color) + ', розмір ' + Shop.esc(line.size) + '</span></div></div></td>' +
      '<td data-label="Ціна">' + Shop.money(p.price) + '</td>' +
      '<td data-label="Кількість"><div class="qty">' +
      '<button class="qty-btn" type="button" data-action="dec" aria-label="Зменшити кількість: ' + name + '">−</button>' +
      '<input type="number" data-action="set" value="' + line.qty + '" min="1" max="' + Shop.MAX_QTY + '" aria-label="Кількість: ' + name + '">' +
      '<button class="qty-btn" type="button" data-action="inc" aria-label="Збільшити кількість: ' + name + '">+</button></div></td>' +
      '<td data-label="Сума"><strong>' + Shop.money(p.price * line.qty) + '</strong></td>' +
      '<td><button class="link-btn" type="button" data-action="remove">Видалити<span class="visually-hidden">: ' + name + '</span></button></td></tr>';
  }

  function render() {
    var lines = Shop.cart.lines();
    var empty = lines.length === 0;
    layout.hidden = empty || !doneBox.hidden;
    emptyBox.hidden = !empty || !doneBox.hidden;
    body.innerHTML = lines.map(rowHTML).join('');
    var subtotal = Shop.cart.subtotal();
    var delivery = deliveryCost(subtotal);
    document.getElementById('sum-items-label').textContent = 'Товари (' + Shop.cart.count() + ')';
    document.getElementById('sum-goods').textContent = Shop.money(subtotal);
    document.getElementById('sum-delivery').textContent = delivery === 0 ? 'Безкоштовно' : Shop.money(delivery);
    document.getElementById('sum-total').textContent = Shop.money(subtotal + delivery);
    var hint = document.getElementById('sum-hint');
    if (deliveryChoice() === 'pickup') { hint.textContent = 'Самовивіз із магазину не потребує оплати доставки.'; }
    else if (subtotal >= Shop.FREE_FROM) { hint.textContent = 'Ви отримали безкоштовну доставку.'; }
    else { hint.textContent = 'До безкоштовної доставки залишилось ' + Shop.money(Shop.FREE_FROM - subtotal) + '.'; }
    Shop.updateBadge();
    if (lastFocus) {
      var target = body.querySelector('tr[data-index="' + lastFocus.index + '"] [data-action="' + lastFocus.action + '"]') || body.querySelector('[data-action="remove"]');
      if (target) { target.focus(); }
      lastFocus = null;
    }
  }

  body.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-action]');
    if (!btn || btn.tagName === 'INPUT') { return; }
    var index = Number(btn.closest('tr').getAttribute('data-index'));
    var line = Shop.cart.lines()[index];
    var action = btn.getAttribute('data-action');
    lastFocus = { index: index, action: action };
    if (action === 'inc') { Shop.cart.setQty(index, line.qty + 1); }
    if (action === 'dec') { Shop.cart.setQty(index, line.qty - 1); }
    if (action === 'remove') { Shop.cart.remove(index); Shop.toast('Товар видалено з кошика'); lastFocus = null; }
    render();
  });
  body.addEventListener('change', function (e) {
    if (e.target.getAttribute('data-action') !== 'set') { return; }
    var index = Number(e.target.closest('tr').getAttribute('data-index'));
    lastFocus = { index: index, action: 'set' };
    Shop.cart.setQty(index, e.target.value);
    render();
  });
  orderForm.addEventListener('change', function (e) { if (e.target.name === 'delivery') { render(); } });

  /* Надсилання замовлення: на сервер йдуть лише ідентифікатори, розмір, колір і кількість — ціни сервер бере з бази */
  function sendOrder(form) {
    var f = form.elements;
    return Shop.api.post('/api/orders', {
      first_name: f.first_name.value.trim(), last_name: f.last_name.value.trim(), phone: f.phone.value.trim(),
      email: f.email.value.trim(), address: f.address.value.trim(), note: f.note.value.trim(),
      delivery: deliveryChoice(), payment: orderForm.querySelector('input[name="payment"]:checked').value,
      agree: f.agree.checked,
      items: Shop.cart.lines().map(function (l) { return { productId: l.id, size: l.size, color: l.color, qty: l.qty }; })
    });
  }
  function onOrderSaved(order, form) {
    document.getElementById('order-text').textContent =
      form.elements.first_name.value.trim() + ', замовлення № ' + order.number + ' на суму ' + Shop.money(order.total) +
      ' прийнято. Підтвердження надіслано на ' + order.email + '. Доставка: ' + (Shop.DELIVERY[order.delivery] ? Shop.DELIVERY[order.delivery].name : order.delivery) + '.';
    Shop.cart.clear();
    form.reset();
    doneBox.hidden = false;
    render();
    doneBox.focus();
  }
  /* Якщо сервер відхилив товари (їх змінили чи видалили) — оновлюємо каталог і кошик */
  function onOrderError(err) {
    if (err && err.status === 400 && err.fields && err.fields.items) {
      Shop.feedback(orderForm, err.fields.items + '. Каталог оновлено — перевірте кошик.', true);
      Shop.ready = Shop.load();
      Shop.ready.then(function () { pruneAndRender(); }, function () {});
      return true;
    }
    return false;
  }
  Shop.initForm(orderForm, Shop.sendForm(orderForm, sendOrder, onOrderSaved, { onError: onOrderError }));

  function pruneAndRender() {
    var removed = Shop.cart.prune();
    notice.hidden = removed === 0;
    if (removed) { notice.textContent = 'Деякі товари в кошику більше недоступні й були видалені (' + removed + ').'; }
    render();
  }
  function load() {
    errorBox.hidden = true;
    layout.hidden = true;
    Shop.ready.then(pruneAndRender).catch(function (err) {
      Shop.loadError(errorBox, err, function () { Shop.ready = Shop.load(); Shop.ready.catch(function () {}); load(); });
    });
  }
  load();
}());
