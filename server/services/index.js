const { logConsent, auditAccess, getPrivacyInfo } = require('./personal-data');
const { queueAppointmentNotifications, processQueue } = require('./notifications');
const { syncAppointmentToMedflex, sendAppointmentEvent } = require('./medflex');

async function afterAppointmentCreated(appointment, req) {
  try {
    await queueAppointmentNotifications(appointment);
    await processQueue();
  } catch (err) {
    console.error('[notifications]', err.message);
  }

  try {
    await syncAppointmentToMedflex(appointment.id);
  } catch (err) {
    console.error('[medflex sync]', err.message);
  }

  await auditAccess({
    action: 'create',
    entity_type: 'appointment',
    entity_id: appointment.id,
    ip_address: req.ip,
    details: 'Публичная запись на приём',
  });
}

async function afterAppointmentStatusChanged(appointmentId, newStatus, req) {
  if (!['cancelled', 'confirmed', 'completed'].includes(newStatus)) return;

  const event = newStatus === 'cancelled' ? 'cancelled' : 'updated';
  try {
    await sendAppointmentEvent(appointmentId, event);
  } catch (err) {
    console.error(`[medflex sync ${event}]`, err.message);
  }

  await auditAccess({
    action: 'update',
    entity_type: 'appointment',
    entity_id: appointmentId,
    ip_address: req?.ip,
    details: `Статус записи изменён: ${newStatus}`,
  });
}

module.exports = {
  logConsent,
  auditAccess,
  getPrivacyInfo,
  afterAppointmentCreated,
  afterAppointmentStatusChanged,
  processQueue,
};
