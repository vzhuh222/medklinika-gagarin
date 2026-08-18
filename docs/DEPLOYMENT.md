# Развёртывание (production)

## 1. Сервер

Рекомендуется VPS (Timeweb, Selectel, Yandex Cloud) с Ubuntu 22.04+.

## 2. PostgreSQL

```bash
sudo apt install postgresql
sudo -u postgres createuser medklinika -P
sudo -u postgres createdb medklinika -O medklinika
```

## 3. Приложение

```bash
git clone <repo> /var/www/medklinika
cd /var/www/medklinika
cp .env.example .env
# заполните .env
npm install --production
npm run init-db:pg
npm start
```

## 4. Process manager (PM2)

```bash
npm install -g pm2
pm2 start server/index.js --name medklinika
pm2 save
pm2 startup
```

## 5. Nginx + HTTPS

```nginx
server {
    listen 443 ssl;
    server_name medklinika-gagarin.ru;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## 6. Без SQLite в production

Обязательно задайте `DATABASE_URL` — без него используется SQLite (только для разработки).

## 7. Резервное копирование

```bash
pg_dump $DATABASE_URL > backup_$(date +%F).sql
```

Ежедневно через cron.
