const express = require('express');
const config = require('../config');
const db = require('../db');
const {
  syncAppointmentToMedflex,
  sendAppointmentEvent,
  handleMedflexWebhook,
  getIntegrationStatus,
  getReadinessChecklist,
  getMappingStats,
  retryFailedSyncs,
} = require('../services/medflex');
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

router.get('/readiness', async (_req, res) => {
  res.json(await getReadinessChecklist());
});

router.get('/mappings', async (_req, res) => {
  const staff = await db.getAll(`
    SELECT id, first_name, last_name, specialty, medflex_doctor_id, is_active
    FROM staff WHERE position = 'врач' ORDER BY last_name, first_name
  `);
  const services = await db.getAll(`
    SELECT id, name, category, medflex_service_id, is_active
    FROM services ORDER BY sort_order, name
  `);
  const stats = await getMappingStats();
  res.json({ staff, services, stats });
});

router.put('/mappings/staff/:id', async (req, res) => {
  const { medflex_doctor_id } = req.body;
  const existing = await db.getOne('SELECT id FROM staff WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Сотрудник не найден' });

  await db.run(`
    UPDATE staff SET medflex_doctor_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `, [medflex_doctor_id || null, req.params.id]);

  const member = await db.getOne(`
    SELECT id, first_name, last_name, specialty, medflex_doctor_id FROM staff WHERE id = ?
  `, [req.params.id]);
  res.json(member);
});

router.put('/mappings/services/:id', async (req, res) => {
  const { medflex_service_id } = req.body;
  const existing = await db.getOne('SELECT id FROM services WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Услуга не найдена' });

  await db.run(`UPDATE services SET medflex_service_id = ? WHERE id = ?`, [medflex_service_id || null, req.params.id]);

  const service = await db.getOne(`
    SELECT id, name, category, medflex_service_id FROM services WHERE id = ?
  `, [req.params.id]);
  res.json(service);
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
    const event = req.body?.event || 'created';
    const result = event === 'created'
      ? await syncAppointmentToMedflex(parseInt(req.params.appointmentId, 10))
      : await sendAppointmentEvent(parseInt(req.params.appointmentId, 10), event);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/medflex/retry-failed', async (_req, res) => {
  const results = await retryFailedSyncs();
  res.json({ retried: results.length, results });
});

router.get('/medflex/logs', async (_req, res) => {
  const logs = await db.getAll(`
    SELECT * FROM integration_sync_log WHERE integration IN ('medflex', 'medlock')
    ORDER BY created_at DESC LIMIT 100
  `);
  res.json(logs);
});

router.get('/medflex/widget', (_req, res) => {
  if (!config.medflex.widgetHtml) {
    return res.status(404).json({ error: 'Виджет МедФлекс не настроен' });
  }
  res.json({ html: config.medflex.widgetHtml, mode: config.medflex.mode });
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
