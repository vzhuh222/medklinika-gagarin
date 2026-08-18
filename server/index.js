require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const { initDatabase } = require('./init-db');
const { initPostgresDatabase } = require('./init-db-pg');
const { processQueue } = require('./services/notifications');

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
  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'medklinika-gagarin' }));

  app.use('/api/auth', authRoutes);
  app.use('/api/staff', staffRoutes);
  app.use('/api/slots', slotsRoutes);
  app.use('/api/integrations', integrationsRoutes);
  app.use('/api/payments', paymentsRoutes);
  app.use('/api/config', configRoutes);
  app.use('/api', recordsRoutes);
  app.use('/api', apiRoutes);

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (path.extname(req.path)) return next();
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.listen(config.port, () => {
    console.log(`МедКлиника на Гагарина: http://localhost:${config.port}`);
    console.log(`БД: ${config.databaseUrl ? 'PostgreSQL' : 'SQLite (для production укажите DATABASE_URL)'}`);
  });

  setInterval(() => {
    processQueue().catch((err) => console.error('[notifications queue]', err.message));
  }, 60_000);
}

bootstrap().catch((err) => {
  console.error('Ошибка запуска:', err);
  process.exit(1);
});
