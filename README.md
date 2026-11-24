# STYLESHOP — інтернет-магазин одягу (лабораторна робота № 5)

Повноцінний вебзастосунок: клієнт (HTML/CSS/JS) + сервер (Node.js) + база даних (SQLite) + REST API.

## Запуск на комп'ютері
1. Встановіть Node.js версії 22.13 або новішої (https://nodejs.org).
2. Скопіюйте `.env.example` у файл `.env` і впишіть свій `ADMIN_TOKEN` (довгий випадковий рядок, мінімум 16 символів).
3. У папці проєкту виконайте: `node server/index.js` (або `npm start`).
4. Відкрийте http://localhost:3000. Адмін-панель: http://localhost:3000/admin.html.
5. Тести: `npm test`.

Зовнішні npm-пакети не потрібні: використано вбудовані модулі Node.js (`node:http`, `node:sqlite`, `node:crypto`, `node:zlib`, `node:test`).

## Змінні середовища
| Змінна | Призначення |
|---|---|
| PORT | порт сервера (на хостингу задається автоматично) |
| ADMIN_TOKEN | секретний ключ адміністратора (не зберігати в репозиторії) |
| DB_PATH | шлях до файлу бази даних SQLite |
| TRUST_PROXY | 1 — якщо сервер за проксі хостингу (для HTTPS і IP клієнта) |
| RATE_MAX | ліміт запитів до API з однієї адреси за хвилину (240) |

## Структура
- `server/` — сервер: `app.js` (обробка запитів), `router.js`, `db.js` (SQLite), `validate.js`, `security.js`, `static.js`, `routes/`
- `public/` — клієнтська частина (HTML, CSS, JS)
- `test/api.test.js` — автоматичні тести API
- `docs/` — журнал взаємодії зі ШІ

## REST API
| Метод і шлях | Доступ | Дія |
|---|---|---|
| GET /api/health | публічно | стан сервера і БД |
| GET /api/config | публічно | налаштування (доставка, розміри) |
| GET /api/products | публічно | список товарів (фільтри, сортування) |
| GET /api/products/:id | публічно | один товар |
| POST /api/products | адмін | створити товар |
| PUT /api/products/:id | адмін | змінити товар |
| DELETE /api/products/:id | адмін | видалити товар |
| POST /api/orders | публічно | оформити замовлення |
| GET /api/orders, GET/PATCH/DELETE /api/orders/:id | адмін | перегляд, зміна статусу, видалення |
| POST /api/subscribers | публічно | підписка на новини |
| GET /api/subscribers | адмін | список підписників |
| POST /api/messages | публічно | повідомлення з форми контактів |
| GET /api/messages, DELETE /api/messages/:id | адмін | перегляд і видалення |

Адмін-запити: заголовок `Authorization: Bearer <ADMIN_TOKEN>`.

## Розгортання (Render.com)
1. Завантажте проєкт у репозиторій GitHub (без `.env` і `node_modules`).
2. На render.com: New → Blueprint → оберіть репозиторій (файл `render.yaml` налаштує все).
3. У змінних середовища задайте `ADMIN_TOKEN`.
4. Після розгортання перевірте `https://<ваш-сайт>/api/health`.
