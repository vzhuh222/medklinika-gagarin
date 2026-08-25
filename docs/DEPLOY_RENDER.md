# Бесплатный хостинг на Render (без карты)

Сайт в интернете, ссылка для клиентов, **0 ₽**. Банковская карта не нужна, если **не** создавать базу Render Postgres.

## Ссылка после деплоя

`https://medklinika-gagarin.onrender.com`

(если имя занято, Render выдаст похожий адрес — он будет на экране после деплоя)

## Один клик

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vzhuh222/medklinika-gagarin)

1. Откройте кнопку выше (войдите через GitHub, если попросит).
2. Instance type: **Free**.
3. **Apply** → дождитесь статуса **Live** (3–8 минут).
4. Скопируйте URL и отправьте клиентам.

Админ: `admin@medklinika.ru` / `admin123`

## Важно для демо

- Первый заход после паузы может занять **30–60 секунд** (сервис засыпает через 15 минут без визитов).
- Записи и врачи живут в SQLite на диске сервиса. После сна или перезапуска Render **может сбросить** этот файл.
- В репозитории есть GitHub Action `Keep site awake` — пинг `/health` каждые 5 минут.
- Надёжнее дублировать пинг на [cron-job.org](https://cron-job.org) (бесплатно, без карты): GET каждые 5 минут на `https://medclinika-gagarin.ru/health`.

## Если нужна постоянная база (тоже 0 ₽)

1. [Neon](https://console.neon.tech/signup) — Postgres, без карты, вход через GitHub.
2. Скопируйте connection string.
3. Render → Environment → добавьте:

| Ключ | Значение |
|------|----------|
| `DATABASE_URL` | строка из Neon |
| `RUN_DB_INIT` | `true` |

4. Redeploy.

## Обновления

```bash
git push
```

Render пересоберёт сайт сам.

## Свой домен (позже, платный только домен)

Render → Settings → Custom Domains → CNAME на `*.onrender.com`.
