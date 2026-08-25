require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./init-db');
const { initPostgresDatabase } = require('./init-db-pg');
const { processQueue } = require('./services/notifications');
const { cleanupExpiredSessions } = require('./services/sessions');
const { attachUser } = require('./middleware/auth');
const { wrapRouter } = require('./utils/async-handler');

const authRoutes = require('./routes/auth');
const staffRoutes = require('./routes/staff');
const apiRoutes = require('./routes/api');
const slotsRoutes = require('./routes/slots');
const recordsRoutes = require('./routes/records');
const integrationsRoutes = require('./routes/integrations');
const paymentsRoutes = require('./routes/payments');
const configRoutes = require('./routes/config');

async function bootstrap() {
  if (config.databaseUrl) {
    const db = require('./db');
    await db.getOne('SELECT 1 AS ok');
    if (process.env.RUN_DB_INIT === 'true') {
      await initPostgresDatabase();
    }
  } else {
    initDatabase();
  }

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(cors({ origin: config.corsOrigin, credentials: false }));
  app.use(express.json({ limit: '256kb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  const isProduction = process.env.NODE_ENV === 'production';
  app.use(express.static(path.join(__dirname, '..', 'public'), {
    maxAge: isProduction ? '1h' : 0,
    etag: true,
  }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'medklinika-gagarin' }));

  app.use('/api', attachUser);
  app.use('/api/auth', wrapRouter(authRoutes));
  app.use('/api/staff', wrapRouter(staffRoutes));
  app.use('/api/slots', wrapRouter(slotsRoutes));
  app.use('/api/integrations', wrapRouter(integrationsRoutes));
  app.use('/api/payments', wrapRouter(paymentsRoutes));
  app.use('/api/config', wrapRouter(configRoutes));
  app.use('/api', wrapRouter(recordsRoutes));
  app.use('/api', wrapRouter(apiRoutes));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Метод API не найден' });
  });

  app.get('*', (req, res, next) => {
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use((err, req, res, _next) => {
    console.error('[error]', req.method, req.originalUrl, '-', err.message);

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'Файл слишком большой (максимум 10 МБ)' });
    }
    if (err.message?.startsWith('Недопустимый тип файла')) {
      return res.status(415).json({ error: err.message });
    }
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'Некорректный формат запроса' });
    }

    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  app.listen(config.port, () => {
    console.log(`МедКлиника на Гагарина: http://localhost:${config.port}`);
    console.log(`БД: ${config.databaseUrl ? 'PostgreSQL' : 'SQLite (локальный режим)'}`);
  });

  setInterval(() => {
    processQueue().catch((err) => console.error('[notifications queue]', err.message));
  }, 60_000).unref();

  setInterval(() => {
    cleanupExpiredSessions().catch((err) => console.error('[sessions cleanup]', err.message));
  }, 60 * 60_000).unref();

  if (config.medflex.enabled) {
    const { retryFailedSyncs } = require('./services/medflex');
    setInterval(() => {
      retryFailedSyncs(10).catch((err) => console.error('[medflex retry]', err.message));
    }, 5 * 60_000).unref();
  }
}

process.on('unhandledRejection', (err) => {
  console.error('[unhandledRejection]', err);
});

bootstrap().catch((err) => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});
