# МедКлиника на Гагарина v2.0

Коммерческий сайт медицинского центра с интеграциями для продажи клиникам.

## Возможности

- Онлайн-запись пациентов по слотам врачей
- Кабинет врача (календарь, карточка пациента, история, файлы)
- Админ-панель
- **PostgreSQL** для production (SQLite — для локальной разработки)
- **МедЛок / МедФлекс** — коннектор синхронизации записей
- **1С** — выгрузка выполненных услуг (XML/CSV)
- **SMS + Email** — уведомления пациентам
- **ЮKassa** — онлайн-оплата
- **152-ФЗ** — согласие, политика конфиденциальности, аудит доступа
- **Яндекс.Карты**

## Быстрый старт (разработка)

```bash
npm install
cp .env.example .env
npm start
```

Сайт: http://localhost:3000

## Бесплатная проба (0 ₽, без карты)

**Koyeb** — полностью бесплатный хостинг для демо:

[![Deploy on Koyeb](https://www.koyeb.com/static/images/deploy/button.svg)](https://app.koyeb.com/deploy?type=git&repository=github.com/vzhuh222/medklinika-gagarin&branch=master&name=medklinika-gagarin&builder=dockerfile)

Инструкция: [docs/DEPLOY_KOYEB.md](docs/DEPLOY_KOYEB.md) · Кратко: [docs/TRIAL_FREE.md](docs/TRIAL_FREE.md)

Ссылка после деплоя: `https://medklinika-gagarin-<логин>.koyeb.app`

## Документация для продажи

- [Коммерческий пакет](docs/COMMERCIAL_PACKAGE.md)
- [Интеграция МедЛок / МедФлекс](docs/MEDLOCK_INTEGRATION.md)

## Тестовые аккаунты

| Роль | Email | Пароль |
|------|-------|--------|
| Админ | admin@medklinika.ru | admin123 |
| Врач | smirnova@medklinika.ru | doctor123 |

## API интеграций

| Метод | URL |
|-------|-----|
| GET | /api/integrations/status |
| POST | /api/integrations/medflex/sync/:id |
| GET | /api/integrations/1c/export.xml |
| POST | /api/payments/create |
| GET | /api/config/privacy |
