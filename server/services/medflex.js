const config = require('../config');
const db = require('../db');

async function syncAppointmentToMedflex(appointmentId) {
  if (!config.medflex.enabled || !config.medflex.webhookUrl) {
    return { skipped: true, reason: 'MedFlex не настроен' };
  }

  const appointment = await db.getOne(`
    SELECT a.*, s.medflex_doctor_id, s.first_name || ' ' || s.last_name AS doctor_name,
           sv.name AS service_name, sv.medflex_service_id
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
    WHERE a.id = ?
  `, [appointmentId]);

  if (!appointment) throw new Error('Запись не найдена');

  const payload = {
    source: 'medklinika-website',
    partner_id: config.medflex.partnerId,
    event: 'appointment.created',
    appointment: {
      external_id: String(appointment.id),
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
    },
  };

  await db.run(`
    INSERT INTO integration_sync_log (integration, direction, entity_type, entity_id, status, request_payload)
    VALUES ('medflex', 'outbound', 'appointment', ?, 'pending', ?)
  `, [appointmentId, JSON.stringify(payload)]);

  try {
    const res = await fetch(config.medflex.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.medflex.apiKey}`,
        'X-Partner-Id': config.medflex.partnerId,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    let responseData;
    try { responseData = JSON.parse(responseText); } catch { responseData = { raw: responseText }; }

    if (!res.ok) throw new Error(responseData.error || responseData.message || `HTTP ${res.status}`);

    const externalId = responseData.appointment_id || responseData.id || null;

    await db.run(`
      UPDATE appointments SET sync_status = 'synced', medflex_external_id = ? WHERE id = ?
    `, [externalId, appointmentId]);

    await db.run(`
      UPDATE integration_sync_log SET status = 'success', external_id = ?, response_payload = ?
      WHERE id = (SELECT MAX(id) FROM integration_sync_log WHERE entity_id = ? AND integration = 'medflex')
    `, [externalId, JSON.stringify(responseData), appointmentId]);

    return { success: true, externalId };
  } catch (err) {
    await db.run(`UPDATE appointments SET sync_status = 'failed' WHERE id = ?`, [appointmentId]);
    await db.run(`
      UPDATE integration_sync_log SET status = 'failed', error_message = ?
      WHERE id = (SELECT MAX(id) FROM integration_sync_log WHERE entity_id = ? AND integration = 'medflex')
    `, [err.message, appointmentId]);
    throw err;
  }
}

async function handleMedflexWebhook(body, headers) {
  if (config.medflex.apiKey && headers.authorization !== `Bearer ${config.medflex.apiKey}`) {
    throw new Error('Unauthorized');
  }

  await db.run(`
    INSERT INTO integration_sync_log (integration, direction, entity_type, entity_id, status, request_payload)
    VALUES ('medflex', 'inbound', ?, ?, 'pending', ?)
  `, [body.entity_type || 'unknown', body.entity_id || null, JSON.stringify(body)]);

  if (body.event === 'appointment.updated' && body.appointment?.external_id) {
    const { status, date, time } = body.appointment;
    await db.run(`
      UPDATE appointments SET status = COALESCE(?, status),
        appointment_date = COALESCE(?, appointment_date),
        appointment_time = COALESCE(?, appointment_time),
        sync_status = 'synced'
      WHERE id = ?
    `, [status, date, time, parseInt(body.appointment.external_id, 10)]);
  }

  if (body.event === 'appointment.cancelled' && body.appointment?.external_id) {
    await db.run(`
      UPDATE appointments SET status = 'cancelled', sync_status = 'synced' WHERE id = ?
    `, [parseInt(body.appointment.external_id, 10)]);
  }

  return { received: true };
}

function getIntegrationStatus() {
  return {
    medflex: {
      enabled: config.medflex.enabled,
      configured: Boolean(config.medflex.webhookUrl && config.medflex.apiKey),
      partnerId: config.medflex.partnerId || null,
      widgetAvailable: Boolean(config.medflex.widgetHtml),
      docs: 'https://help.medlock.me/vneshnie-partnyory/',
      note: 'МедЛок не предоставляет прямой API. Интеграция через платформу МедФлекс после договора с help@medrocket.ru',
    },
    medlock: {
      note: 'Полная синхронизация с МИС МедЛок выполняется через МедФлекс. Альтернатива — виджет онлайн-записи МедФлекс на сайте.',
      helpUrl: 'https://help.medlock.me/kak_vklyuchit_onlajn_zapis/',
    },
  };
}

module.exports = { syncAppointmentToMedflex, handleMedflexWebhook, getIntegrationStatus };
