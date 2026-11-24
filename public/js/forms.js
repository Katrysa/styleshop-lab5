'use strict';
/* forms.js — клієнтська валідація форм, надсилання на сервер (Fetch + async/await), відображення помилок */
(function () {
  var Shop = window.Shop;

  /* Правила клієнтської перевірки: повертають текст помилки або порожній рядок.
     Сервер перевіряє ті самі дані ще раз — клієнтська перевірка лише покращує зручність. */
  function nameRule(label, emptyMsg) {
    return function (value) {
      var v = value.trim();
      if (!v) { return emptyMsg; }
      if (v.length < 2) { return label + ' має містити щонайменше 2 символи'; }
      if (!/^[\p{L}][\p{L}'’\- ]*$/u.test(v)) { return label + ' може містити лише літери, пробіл, дефіс та апостроф'; }
      return '';
    };
  }
  var RULES = {
    first_name: nameRule('Ім’я', 'Введіть ім’я'),
    last_name: nameRule('Прізвище', 'Введіть прізвище'),
    name: nameRule('Ім’я', 'Введіть ваше ім’я'),
    phone: function (value) {
      var v = value.replace(/[\s()\-]/g, '');
      if (!v) { return 'Введіть номер телефону'; }
      if (!/^(\+38)?0\d{9}$/.test(v)) { return 'Номер має бути у форматі +380XXXXXXXXX або 0XXXXXXXXX'; }
      return '';
    },
    email: function (value) {
      var v = value.trim();
      if (!v) { return 'Введіть адресу електронної пошти'; }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { return 'Адреса виглядає неправильно. Приклад: name@example.com'; }
      return '';
    },
    address: function (value) {
      var v = value.trim();
      if (!v) { return 'Вкажіть місто та адресу або номер відділення'; }
      if (v.length < 5) { return 'Адреса занадто коротка: вкажіть місто та вулицю чи номер відділення'; }
      return '';
    },
    message: function (value) {
      var v = value.trim();
      if (!v) { return 'Напишіть повідомлення'; }
      if (v.length < 10) { return 'Повідомлення занадто коротке: ' + v.length + ' з 10 символів'; }
      if (v.length > 1000) { return 'Повідомлення не може бути довшим за 1000 символів'; }
      return '';
    },
    note: function (value) { return value.length > 300 ? 'Коментар не може бути довшим за 300 символів' : ''; }
  };
  var CHECK_MSG = { agree: 'Підтвердьте згоду на обробку персональних даних' };
  var RADIO_MSG = { delivery: 'Оберіть спосіб доставки', payment: 'Оберіть спосіб оплати' };

  function errorBox(field) {
    var id = (field.type === 'radio' ? field.name : field.id) + '-error';
    var box = document.getElementById(id);
    if (!box) {
      box = document.createElement('p');
      box.className = 'field-error';
      box.id = id;
      box.setAttribute('role', 'alert');
      box.hidden = true;
      if (field.type === 'radio') { field.closest('fieldset').appendChild(box); }
      else {
        var anchor = field.type === 'checkbox' ? (field.closest('label') || field) : field;
        anchor.insertAdjacentElement('afterend', box);
        field.setAttribute('aria-describedby', id);
      }
    }
    return box;
  }
  function setError(field, message) {
    var box = errorBox(field);
    box.textContent = message;
    box.hidden = !message;
    if (field.type === 'radio') { return; }
    if (message) { field.setAttribute('aria-invalid', 'true'); } else { field.removeAttribute('aria-invalid'); }
  }
  function validateField(field) {
    var message = '';
    if (field.type === 'checkbox') {
      if (!field.checked && CHECK_MSG[field.name]) { message = CHECK_MSG[field.name]; }
    } else if (field.type === 'radio') {
      if (!field.form.querySelector('input[name="' + field.name + '"]:checked')) { message = RADIO_MSG[field.name] || 'Оберіть варіант'; }
    } else if (RULES[field.name]) {
      message = RULES[field.name](field.value);
    }
    setError(field, message);
    return !message;
  }
  function fieldsOf(form) {
    var seen = {};
    return Shop.$$('input, textarea, select', form).filter(function (f) {
      if (f.type === 'submit' || f.type === 'button' || f.type === 'reset') { return false; }
      if (f.type === 'radio') { if (seen[f.name]) { return false; } seen[f.name] = true; }
      return true;
    });
  }
  function validateForm(form) {
    var firstInvalid = null;
    fieldsOf(form).forEach(function (f) { if (!validateField(f) && !firstInvalid) { firstInvalid = f; } });
    if (firstInvalid) { firstInvalid.focus(); }
    return !firstInvalid;
  }
  function clearErrors(form) { fieldsOf(form).forEach(function (f) { setError(f, ''); }); }

  Shop.initForm = function (form, onValid) {
    form.noValidate = true;
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      if (validateForm(form)) { onValid(form); }
    });
    form.addEventListener('focusout', function (event) {
      var f = event.target;
      if (f.matches && f.matches('input, textarea') && f.type !== 'radio') { validateField(f); }
    });
    form.addEventListener('input', function (event) {
      var f = event.target;
      if (f.getAttribute && f.getAttribute('aria-invalid') === 'true') { validateField(f); }
    });
    form.addEventListener('change', function (event) {
      var f = event.target;
      if (f.type === 'radio' || f.type === 'checkbox') { validateField(f); }
    });
    form.addEventListener('reset', function () { clearErrors(form); });
  };

  /* Помилки валідації з відповіді сервера (400): { поле: повідомлення }. Повертає повідомлення без поля. */
  Shop.showFieldErrors = function (form, fields) {
    var general = [];
    var first = null;
    Object.keys(fields || {}).forEach(function (name) {
      var el = form.querySelector('[name="' + name + '"]');
      if (el) { setError(el, fields[name]); if (!first) { first = el; } } else { general.push(fields[name]); }
    });
    if (first) { first.focus(); }
    return general;
  };

  /* Блок повідомлення під формою (успіх або помилка) */
  function feedback(form) {
    var id = form.id + '-feedback';
    var box = document.getElementById(id);
    if (!box) {
      box = document.createElement('p');
      box.id = id;
      box.className = 'form-status';
      box.hidden = true;
      form.insertAdjacentElement('afterend', box);
    }
    return box;
  }
  Shop.feedback = function (form, message, isError) {
    var box = feedback(form);
    box.textContent = message || '';
    box.hidden = !message;
    box.classList.toggle('is-error', !!isError);
    box.setAttribute('role', isError ? 'alert' : 'status');
  };

  function setPending(form, pending) {
    var btn = form.querySelector('[type="submit"]');
    form.setAttribute('aria-busy', pending ? 'true' : 'false');
    if (!btn) { return; }
    if (pending) { btn.setAttribute('data-label', btn.textContent); btn.textContent = 'Надсилання…'; btn.disabled = true; }
    else { btn.textContent = btn.getAttribute('data-label') || btn.textContent; btn.disabled = false; }
  }

  /* Обгортка надсилання: блокує кнопку на час запиту, показує помилки сервера та мережі.
     send(form) -> Promise; onSuccess(data, form); opts.onError(err) -> true, якщо помилку вже оброблено */
  Shop.sendForm = function (form, send, onSuccess, opts) {
    return async function () {
      Shop.feedback(form, '');
      setPending(form, true);
      try {
        var data = await send(form);
        onSuccess(data, form);
      } catch (err) {
        if (opts && opts.onError && opts.onError(err)) { return; }
        if (err && err.status === 400 && err.fields) {
          var rest = Shop.showFieldErrors(form, err.fields);
          if (rest.length) { Shop.feedback(form, rest.join('. '), true); }
        } else if (err && err.status === 0) {
          Shop.feedback(form, err.message + '. Дані збережено у формі — перевірте з’єднання та спробуйте ще раз.', true);
        } else if (err && err.status === 429) {
          Shop.feedback(form, err.message, true);
        } else {
          Shop.feedback(form, 'Не вдалося надіслати дані. Спробуйте пізніше.', true);
        }
      } finally {
        setPending(form, false);
      }
    };
  };

  function showStatus(id, message) {
    var box = document.getElementById(id);
    if (box) { box.textContent = message; box.hidden = false; }
  }

  /* Підписка (головна сторінка) */
  var sub = document.getElementById('subscribe-form');
  if (sub) {
    Shop.initForm(sub, Shop.sendForm(sub,
      function (form) { return Shop.api.post('/api/subscribers', { email: form.elements.email.value.trim() }); },
      function (data, form) {
        showStatus('sub-status', data.already_subscribed
          ? 'Адреса ' + data.email + ' уже є в списку розсилки.'
          : 'Дякуємо! Підписку для ' + data.email + ' оформлено.');
        form.reset();
      }));
  }

  /* Зворотний зв’язок (контакти) */
  var contact = document.getElementById('contact-form');
  if (contact) {
    Shop.initForm(contact, Shop.sendForm(contact,
      function (form) {
        return Shop.api.post('/api/messages', {
          name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), message: form.elements.message.value.trim()
        });
      },
      function (data, form) {
        showStatus('contact-status', 'Дякуємо, ' + form.elements.name.value.trim() + '! Повідомлення надіслано, ми відповімо на ' + form.elements.email.value.trim() + ' протягом робочого дня.');
        form.reset();
      }));
  }
}());
