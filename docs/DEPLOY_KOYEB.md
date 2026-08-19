# Полностью бесплатный деплой (Koyeb)

**0 ₽, без банковской карты** — сайт клиники в интернете.

## Ссылка после деплоя

`https://medklinika-gagarin-<ваш-логин>.koyeb.app`

(имя можно задать при создании — например `medklinika-gagarin`)

---

## Вариант 1 — самый простой (SQLite, 5 минут)

Подходит для пробы и демо. База хранится на диске сервиса (2 GB бесплатно).

### Шаги

1. Регистрация: https://app.koyeb.com/auth/signup (можно через GitHub)
2. **Create Web Service**
3. **GitHub** → репозиторий `vzhuh222/medklinika-gagarin`, ветка `master`
4. **Builder:** Dockerfile
5. **Instance type:** Free
6. **Port:** `8000`
7. **Переменные окружения:**

| Ключ | Значение |
|------|----------|
| `NODE_ENV` | `production` |
| `MEDFLEX_ENABLED` | `false` |
| `PD_OPERATOR_NAME` | `МедКлиника на Гагарина` |

`DATABASE_URL` **не указывайте** — будет SQLite.

8. **Deploy**

---

## Вариант 2 — с PostgreSQL (надёжнее)

1. Koyeb → **Create Database** → PostgreSQL → **Free** (Frankfurt)
2. Скопируйте **Connection string**
3. При создании Web Service добавьте:

| Ключ | Значение |
|------|----------|
| `DATABASE_URL` | строка подключения из шага 2 |
| `RUN_DB_INIT` | `true` |
| `NODE_ENV` | `production` |
| `MEDFLEX_ENABLED` | `false` |

---

## Тестовые аккаунты

| Роль | Email | Пароль |
|------|-------|--------|
| Админ | admin@medklinika.ru | admin123 |
| Врач | smirnova@medklinika.ru | doctor123 |

## Что бесплатно

- Сайт и онлайн-запись
- Кабинет врача и админка
- HTTPS и ссылка `.koyeb.app`
- SMS / оплата / МедФлекс — **выключены** (не нужны для пробы)

## Обновления

```bash
git push
```

Koyeb пересоберёт сайт автоматически.

## Почему не Render

На Render бесплатная база **истекает через 30 дней**, часто просят карту. **Koyeb** даёт бесплатный сервис без срока и обычно **без карты**.

## Свой домен (позже)

Koyeb → Settings → Domains → добавить `medklinika-gagarin.ru`
