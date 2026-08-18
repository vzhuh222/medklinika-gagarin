const { logConsent, auditAccess, getPrivacyInfo } = require('./personal-data');
const { queueAppointmentNotifications, processQueue } = require('./notifications');
const { syncAppointmentToMedflex } = require('./medflex');

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

module.exports = { logConsent, auditAccess, getPrivacyInfo, afterAppointmentCreated, processQueue };
