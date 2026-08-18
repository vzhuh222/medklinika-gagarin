# Render.com — деплой «МедКлиника на Гагарина»

## Постоянная ссылка

**https://medklinika-gagarin.onrender.com**

## Деплой через Render (один раз)

1. https://dashboard.render.com/select-repo?type=blueprint
2. Подключите репозиторий `medklinika-gagarin`
3. Дождитесь статуса **Live**

## Свой домен (medklinika-gagarin.ru)

1. Купите домен на reg.ru (~300–700 ₽/год)
2. Render → Settings → Custom Domains
3. DNS: CNAME → `medklinika-gagarin.onrender.com`

## Обновления после деплоя

```bash
git add .
git commit -m "изменения"
git push
```

Render пересоберёт сайт автоматически.
