const express = require('express');
const config = require('../config');
const db = require('../db');
const { syncAppointmentToMedflex, handleMedflexWebhook, getIntegrationStatus } = require('../services/medflex');
const { exportCompletedServices, exportCsv } = require('../services/onec');
const { processQueue } = require('../services/notifications');

const router = express.Router();

router.get('/status', async (_req, res) => {
  res.json({
    integrations: getIntegrationStatus(),
    notifications: {
      smsConfigured: Boolean(config.sms.apiId),
      emailConfigured: Boolean(config.smtp.host),
    },
    payments: {
      yookassaConfigured: Boolean(config.yookassa.shopId && config.yookassa.secretKey),
    },
    database: config.databaseUrl ? 'postgresql' : 'sqlite',
  });
});

router.post('/medflex/webhook', async (req, res) => {
  try {
    const result = await handleMedflexWebhook(req.body, req.headers);
    res.json(result);
  } catch (err) {
    res.status(err.message === 'Unauthorized' ? 401 : 400).json({ error: err.message });
  }
});

router.post('/medflex/sync/:appointmentId', async (req, res) => {
  try {
    const result = await syncAppointmentToMedflex(parseInt(req.params.appointmentId, 10));
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/medflex/logs', async (_req, res) => {
  const logs = await db.getAll(`
    SELECT * FROM integration_sync_log WHERE integration IN ('medflex', 'medlock')
    ORDER BY created_at DESC LIMIT 100
  `);
  res.json(logs);
});

router.get('/1c/export.xml', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  const { xml, count } = await exportCompletedServices(from, to);
  res.set('Content-Type', 'application/xml; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="services_${from}_${to}.xml"`);
  res.send(xml);
});

router.get('/1c/export.csv', async (req, res) => {
  const from = req.query.from || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const to = req.query.to || new Date().toISOString().split('T')[0];
  const csv = await exportCsv(from, to);
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="services_${from}_${to}.csv"`);
  res.send('\uFEFF' + csv);
});

router.post('/notifications/process', async (_req, res) => {
  const processed = await processQueue();
  res.json({ processed });
});

module.exports = router;
