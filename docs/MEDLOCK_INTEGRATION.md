# Интеграция с МедЛок и МедФлекс

## Важно

**МедЛок** ([medlock.ru](https://medlock.ru/)) — облачная МИС для клиник. **Прямого API для сторонних сайтов нет** (требования безопасности медданных).

Официальный путь интеграции — платформа **МедФлекс** (партнёр MedRocket):

| Ресурс | URL |
|--------|-----|
| База знаний | https://help.medlock.me/ |
| Онлайн-запись | https://help.medlock.me/kak_vklyuchit_onlajn_zapis/ |
| Внешние партнёры | https://help.medlock.me/vneshnie-partnyory/ |
| Контакт | help@medrocket.ru |

**Передача клиенту:** [MEDLOCK_HANDOVER.md](MEDLOCK_HANDOVER.md)

---

## Два режима работы

### Режим A: Собственная запись на сайте + синхронизация в МедЛок

```
Пациент → Сайт (форма записи) → POST webhook → МедФлекс → МедЛок
МедЛок  → МедФлекс → POST /api/integrations/medflex/webhook → Сайт
```

```env
MEDFLEX_ENABLED=true
MEDFLEX_MODE=native
MEDFLEX_WEBHOOK_URL=https://...
MEDFLEX_API_KEY=...
MEDFLEX_PARTNER_ID=...
MEDLOCK_BRANCH_ID=...   # ID филиала в МедЛок (опционально)
```

**События:**
- `appointment.created` — при новой записи на сайте
- `appointment.updated` — при изменении статуса (подтверждена, завершена)
- `appointment.cancelled` — при отмене

### Режим B: Виджет МедФлекс на сайте

Расписание напрямую из МедЛок, без собственных слотов:

```env
MEDFLEX_MODE=widget
MEDFLEX_WIDGET_HTML=<код виджета из личного кабинета МедФлекс>
```

### Режим A+B

```env
MEDFLEX_MODE=both
```

---

## Сопоставление ID

В админке → **МедЛок** заполните:

- `medflex_doctor_id` — ID врача в МедФлекс/МедЛок
- `medflex_service_id` — ID услуги

Без сопоставления используются внутренние ID сайта (для тестов).

---

## API

| Метод | URL | Описание |
|-------|-----|----------|
| GET | `/api/integrations/readiness` | Чек-лист готовности |
| GET | `/api/integrations/status` | Статус интеграций |
| POST | `/api/integrations/medflex/webhook` | Входящие события |
| POST | `/api/integrations/medflex/sync/:id` | Ручная синхронизация |
| POST | `/api/integrations/medflex/retry-failed` | Повтор ошибок |
| GET | `/api/integrations/medflex/logs` | Журнал |
| GET | `/api/integrations/mappings` | Сопоставления |
| PUT | `/api/integrations/mappings/staff/:id` | ID врача |
| PUT | `/api/integrations/mappings/services/:id` | ID услуги |

---

## Формат исходящего payload

```json
{
  "source": "medklinika-website",
  "partner_id": "PARTNER_ID",
  "event": "appointment.created",
  "appointment": {
    "external_id": "123",
    "patient_name": "Иванов Иван",
    "patient_phone": "+79991234567",
    "date": "2026-08-25",
    "time": "10:00",
    "doctor_id": "medflex_doctor_id",
    "service_id": "medflex_service_id",
    "status": "confirmed",
    "branch_id": "MEDLOCK_BRANCH_ID"
  }
}
```

---

## Шаги для клиники

1. Договор с МедЛок / МедФлекс
2. Получить webhook URL, API key, Partner ID
3. В МедЛок: Модули → Интеграции МедФлекс → включить
4. Заполнить `.env` на сервере
5. Админка → МедЛок → сопоставить ID
6. Указать входящий webhook: `https://сайт/api/integrations/medflex/webhook`
7. Тестовая запись → проверка в МедЛок

---

## 1С

Дополнительная выгрузка (МедЛок имеет свою):

- XML: `GET /api/integrations/1c/export.xml?from=2026-01-01&to=2026-01-31`
- CSV: `GET /api/integrations/1c/export.csv?from=...&to=...`
