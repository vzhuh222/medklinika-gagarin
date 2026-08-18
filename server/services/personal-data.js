const config = require('../config');
const db = require('../db');

async function logConsent({ patient_name, patient_phone, patient_email, ip_address, user_agent }) {
  const params = [patient_name, patient_phone, patient_email || null, ip_address || null, user_agent || null];
  try {
    const result = await db.run(`
      INSERT INTO consent_logs (patient_name, patient_phone, patient_email, consent_type, consent_text_version, ip_address, user_agent)
      VALUES (?, ?, ?, 'appointment', '1.0', ?, ?)
      RETURNING id
    `, params);
    return result.lastInsertRowid || result.rows?.[0]?.id;
  } catch {
    const result = await db.run(`
      INSERT INTO consent_logs (patient_name, patient_phone, patient_email, consent_type, consent_text_version, ip_address, user_agent)
      VALUES (?, ?, ?, 'appointment', '1.0', ?, ?)
    `, params);
    return result.lastInsertRowid;
  }
}

async function auditAccess({ user_id, staff_id, action, entity_type, entity_id, ip_address, details }) {
  await db.run(`
    INSERT INTO personal_data_audit (user_id, staff_id, action, entity_type, entity_id, ip_address, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [user_id || null, staff_id || null, action, entity_type, entity_id || null, ip_address || null, details || null]);
}

function getPrivacyInfo() {
  return {
    operatorName: config.personalData.operatorName,
    operatorInn: config.personalData.operatorInn,
    operatorAddress: config.personalData.operatorAddress,
    dpoEmail: config.personalData.dpoEmail,
    retentionDays: config.personalData.retentionDays,
    purposes: [
      'Запись на приём к врачу',
      'Информирование о записи (SMS/email)',
      'Ведение медицинской документации в рамках оказания услуг',
      'Синхронизация с МИС МедЛок через платформу МедФлекс (при подключении)',
    ],
    legalBasis: 'Согласие субъекта персональных данных (ст. 6 и 9 152-ФЗ), договор оказания медицинских услуг',
    consentVersion: '1.0',
  };
}

module.exports = { logConsent, auditAccess, getPrivacyInfo };
