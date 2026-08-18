const config = require('../config');
const db = require('../db');

function escapeXml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function exportCompletedServices(from, to) {
  const appointments = await db.getAll(`
    SELECT a.*, s.last_name || ' ' || s.first_name AS doctor_name,
           sv.name AS service_name, sv.price_from
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
    WHERE a.status IN ('confirmed', 'completed')
      AND a.appointment_date BETWEEN ? AND ?
    ORDER BY a.appointment_date, a.appointment_time
  `, [from, to]);

  const orgName = config.oneC.orgName;
  const items = appointments.map((a, i) => `
    <ServiceLine>
      <LineNumber>${i + 1}</LineNumber>
      <Date>${a.appointment_date}</Date>
      <Time>${String(a.appointment_time).slice(0, 5)}</Time>
      <PatientName>${escapeXml(a.patient_name)}</PatientName>
      <PatientPhone>${escapeXml(a.patient_phone)}</PatientPhone>
      <DoctorName>${escapeXml(a.doctor_name)}</DoctorName>
      <ServiceName>${escapeXml(a.service_name)}</ServiceName>
      <Amount>${a.price_from || 0}</Amount>
      <PaymentStatus>${a.payment_status || 'none'}</PaymentStatus>
      <ExternalId>${a.id}</ExternalId>
    </ServiceLine>
  `).join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<MedicalServicesExport xmlns="urn:medklinika:1c:export:1.0">
  <Organization>${escapeXml(orgName)}</Organization>
  <PeriodFrom>${from}</PeriodFrom>
  <PeriodTo>${to}</PeriodTo>
  <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
  <Services>${items}
  </Services>
</MedicalServicesExport>`;

  await db.run(`
    INSERT INTO integration_sync_log (integration, direction, entity_type, status, request_payload)
    VALUES ('1c', 'outbound', 'export', 'success', ?)
  `, [JSON.stringify({ from, to, count: appointments.length })]);

  return { xml, count: appointments.length, appointments };
}

async function exportCsv(from, to) {
  const { appointments } = await exportCompletedServices(from, to);
  const header = 'Дата;Время;Пациент;Телефон;Врач;Услуга;Сумма;Статус оплаты;ID';
  const rows = appointments.map(a =>
    [a.appointment_date, String(a.appointment_time).slice(0, 5), a.patient_name, a.patient_phone,
     a.doctor_name, a.service_name, a.price_from || 0, a.payment_status, a.id].join(';')
  );
  return [header, ...rows].join('\n');
}

module.exports = { exportCompletedServices, exportCsv };
