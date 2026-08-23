const config = require('../config');
const db = require('../db');

const EVENT_MAP = {
  created: 'appointment.created',
  updated: 'appointment.updated',
  cancelled: 'appointment.cancelled',
};

async function getAppointmentPayload(appointmentId) {
  return db.getOne(`
    SELECT a.*, s.medflex_doctor_id, s.first_name || ' ' || s.last_name AS doctor_name,
           sv.name AS service_name, sv.medflex_service_id
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
    WHERE a.id = ?
  `, [appointmentId]);
}

function buildPayload(appointment, event) {
  return {
    source: 'medklinika-website',
    partner_id: config.medflex.partnerId,
    event: EVENT_MAP[event] || event,
    appointment: {
      external_id: String(appointment.id),
      medflex_id: appointment.medflex_external_id || null,
      patient_name: appointment.patient_name,
      patient_phone: appointment.patient_phone_normalized || appointment.patient_phone,
      patient_email: appointment.patient_email,
      date: appointment.appointment_date,
      time: String(appointment.appointment_time).slice(0, 5),
      doctor_id: appointment.medflex_doctor_id || String(appointment.staff_id),
      doctor_name: appointment.doctor_name,
      service_id: appointment.medflex_service_id || (appointment.service_id ? String(appointment.service_id) : null),
      service_name: appointment.service_name,
      comment: appointment.comment,
      status: appointment.status,
      branch_id: config.medlock.branchId || null,
    },
  };
}

async function sendAppointmentEvent(appointmentId, event = 'created') {
  if (!config.medflex.enabled || !config.medflex.webhookUrl) {
    return { skipped: true, reason: 'MedFlex не настроен' };
  }

  const appointment = await getAppointmentPayload(appointmentId);
  if (!appointment) throw new Error('Запись не найдена');

  const payload = buildPayload(appointment, event);

  await db.run(`UPDATE appointments SET sync_status = 'pending' WHERE id = ?`, [appointmentId]);

  const logResult = await db.run(`
    INSERT INTO integration_sync_log (integration, direction, entity_type, entity_id, status, request_payload)
    VALUES ('medflex', 'outbound', 'appointment', ?, 'pending', ?)
    RETURNING id
  `, [appointmentId, JSON.stringify(payload)]);

  let logId = logResult.rows?.[0]?.id || logResult.lastInsertRowid;
  if (!logId) {
    const last = await db.getOne(`
      SELECT id FROM integration_sync_log
      WHERE integration = 'medflex' AND entity_id = ? AND direction = 'outbound'
      ORDER BY id DESC LIMIT 1
    `, [appointmentId]);
    logId = last?.id;
  }

  try {
    const res = await fetch(config.medflex.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.medflex.apiKey}`,
        'X-Partner-Id': config.medflex.partnerId,
        'X-Event-Type': EVENT_MAP[event] || event,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    let responseData;
    try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

    if (!res.ok) throw new Error(responseData.error || responseData.message || `HTTP ${res.status}`);

    const externalId = responseData.appointment_id || responseData.id || appointment.medflex_external_id || null;

    await db.run(`
      UPDATE appointments SET sync_status = 'synced', medflex_external_id = COALESCE(?, medflex_external_id) WHERE id = ?
    `, [externalId, appointmentId]);

    if (logId) {
      await db.run(`
        UPDATE integration_sync_log SET status = 'success', external_id = ?, response_payload = ? WHERE id = ?
      `, [externalId, JSON.stringify(responseData), logId]);
    }

    return { success: true, externalId, event };
  } catch (err) {
    await db.run(`UPDATE appointments SET sync_status = 'failed' WHERE id = ?`, [appointmentId]);
    if (logId) {
      await db.run(`
        UPDATE integration_sync_log SET status = 'failed', error_message = ? WHERE id = ?
      `, [err.message, logId]);
    }
    throw err;
  }
}

async function syncAppointmentToMedflex(appointmentId) {
  return sendAppointmentEvent(appointmentId, 'created');
}

async function handleMedflexWebhook(body, headers) {
  if (config.medflex.apiKey && headers.authorization !== `Bearer ${config.medflex.apiKey}`) {
    throw new Error('Unauthorized');
  }

  const logResult = await db.run(`
    INSERT INTO integration_sync_log (integration, direction, entity_type, entity_id, status, request_payload)
    VALUES ('medflex', 'inbound', ?, ?, 'pending', ?)
    RETURNING id
  `, [body.entity_type || 'appointment', body.entity_id || body.appointment?.external_id || null, JSON.stringify(body)]);

  let logId = logResult.rows?.[0]?.id || logResult.lastInsertRowid;

  try {
    if (body.event === 'appointment.updated' && body.appointment?.external_id) {
      const { status, date, time } = body.appointment;
      await db.run(`
        UPDATE appointments SET status = COALESCE(?, status),
          appointment_date = COALESCE(?, appointment_date),
          appointment_time = COALESCE(?, appointment_time),
          sync_status = 'synced',
          medflex_external_id = COALESCE(?, medflex_external_id)
        WHERE id = ?
      `, [status, date, time, body.appointment.medflex_id || body.appointment.id || null, parseInt(body.appointment.external_id, 10)]);
    }

    if (body.event === 'appointment.cancelled' && body.appointment?.external_id) {
      const apptId = parseInt(body.appointment.external_id, 10);
      const appt = await db.getOne('SELECT slot_id FROM appointments WHERE id = ?', [apptId]);
      await db.run(`UPDATE appointments SET status = 'cancelled', sync_status = 'synced' WHERE id = ?`, [apptId]);
      if (appt?.slot_id) {
        await db.run(`UPDATE time_slots SET status = 'available', appointment_id = NULL WHERE id = ?`, [appt.slot_id]);
      }
    }

    if (logId) {
      await db.run(`UPDATE integration_sync_log SET status = 'success' WHERE id = ?`, [logId]);
    }

    return { received: true, event: body.event };
  } catch (err) {
    if (logId) {
      await db.run(`UPDATE integration_sync_log SET status = 'failed', error_message = ? WHERE id = ?`, [err.message, logId]);
    }
    throw err;
  }
}

async function retryFailedSyncs(limit = 20) {
  const failed = await db.getAll(`
    SELECT id FROM appointments WHERE sync_status = 'failed' ORDER BY id DESC LIMIT ?
  `, [limit]);

  const results = [];
  for (const row of failed) {
    try {
      const result = await sendAppointmentEvent(row.id, 'created');
      results.push({ id: row.id, ok: true, ...result });
    } catch (err) {
      results.push({ id: row.id, ok: false, error: err.message });
    }
  }
  return results;
}

async function getMappingStats() {
  const staff = await db.getOne(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN medflex_doctor_id IS NOT NULL AND medflex_doctor_id != '' THEN 1 ELSE 0 END), 0) AS mapped
    FROM staff WHERE is_active = 1 AND position = 'врач'
  `);
  const services = await db.getOne(`
    SELECT COUNT(*) AS total,
           COALESCE(SUM(CASE WHEN medflex_service_id IS NOT NULL AND medflex_service_id != '' THEN 1 ELSE 0 END), 0) AS mapped
    FROM services WHERE is_active = 1
  `);
  const syncStats = await db.getOne(`
    SELECT
      COALESCE(SUM(CASE WHEN sync_status = 'synced' THEN 1 ELSE 0 END), 0) AS synced,
      COALESCE(SUM(CASE WHEN sync_status = 'failed' THEN 1 ELSE 0 END), 0) AS failed,
      COALESCE(SUM(CASE WHEN sync_status = 'pending' THEN 1 ELSE 0 END), 0) AS pending,
      COALESCE(SUM(CASE WHEN sync_status = 'local' THEN 1 ELSE 0 END), 0) AS local
    FROM appointments
  `);
  return { staff, services, syncStats };
}

function getIntegrationStatus() {
  const mode = config.medflex.mode;
  return {
    medflex: {
      enabled: config.medflex.enabled,
      configured: Boolean(config.medflex.webhookUrl && config.medflex.apiKey),
      mode,
      partnerId: config.medflex.partnerId || null,
      webhookUrlSet: Boolean(config.medflex.webhookUrl),
      widgetAvailable: Boolean(config.medflex.widgetHtml),
      inboundWebhook: `${config.siteUrl}/api/integrations/medflex/webhook`,
    },
    medlock: {
      product: 'МИС МедЛок',
      productUrl: 'https://medlock.ru/',
      integrationPath: 'Через платформу МедФлекс (официальный партнёрский канал)',
      docs: 'https://help.medlock.me/vneshnie-partnyory/',
      onlineBooking: 'https://help.medlock.me/kak_vklyuchit_onlajn_zapis/',
      contact: 'help@medrocket.ru',
      branchId: config.medlock.branchId || null,
      note: 'МедЛок не предоставляет прямой API. Сайт подготовлен к подключению через МедФлекс после договора с клиникой.',
    },
  };
}

async function getReadinessChecklist() {
  const status = getIntegrationStatus();
  const mappings = await getMappingStats();
  const doctorsTotal = Number(mappings.staff?.total || 0);
  const doctorsMapped = Number(mappings.staff?.mapped || 0);
  const servicesTotal = Number(mappings.services?.total || 0);
  const servicesMapped = Number(mappings.services?.mapped || 0);

  const items = [
    {
      id: 'contract',
      label: 'Договор с МедЛок / МедФлекс',
      done: false,
      manual: true,
      hint: 'Заключить договор и получить webhook URL, API key, Partner ID от help@medrocket.ru',
    },
    {
      id: 'env',
      label: 'Переменные окружения MEDFLEX_* на сервере',
      done: status.medflex.configured && config.medflex.enabled,
      hint: 'MEDFLEX_ENABLED=true, MEDFLEX_WEBHOOK_URL, MEDFLEX_API_KEY, MEDFLEX_PARTNER_ID',
    },
    {
      id: 'doctors',
      label: 'Сопоставление ID врачей с МедФлекс',
      done: doctorsTotal > 0 && doctorsMapped >= doctorsTotal,
      progress: `${doctorsMapped}/${doctorsTotal}`,
      hint: 'Заполните medflex_doctor_id в админке → раздел «МедЛок»',
    },
    {
      id: 'services',
      label: 'Сопоставление ID услуг с МедФлекс',
      done: servicesTotal > 0 && servicesMapped >= servicesTotal,
      progress: `${servicesMapped}/${servicesTotal}`,
      hint: 'Заполните medflex_service_id для каждой услуги',
    },
    {
      id: 'medlock_module',
      label: 'Модуль МедФлекс включён в МедЛок',
      done: false,
      manual: true,
      hint: 'МедЛок → Модули → Интеграции МедФлекс → включить передачу данных',
    },
    {
      id: 'webhook_inbound',
      label: 'Входящий webhook настроен в МедФлекс',
      done: status.medflex.configured,
      hint: `URL для МедФлекс: ${status.medflex.inboundWebhook}`,
    },
    {
      id: 'test_booking',
      label: 'Тестовая запись синхронизирована',
      done: Number(mappings.syncStats?.synced || 0) > 0,
      hint: 'Создайте тестовую запись на сайте и проверьте появление в МедЛок',
    },
  ];

  const doneCount = items.filter(i => i.done).length;
  return {
    ready: doneCount === items.length,
    progress: `${doneCount}/${items.length}`,
    items,
    mappings,
    status,
  };
}

module.exports = {
  syncAppointmentToMedflex,
  sendAppointmentEvent,
  handleMedflexWebhook,
  getIntegrationStatus,
  getReadinessChecklist,
  getMappingStats,
  retryFailedSyncs,
};
