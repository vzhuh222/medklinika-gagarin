const config = require('../config');
const db = require('../db');

async function queueAppointmentNotifications(appointment) {
  const clinic = await db.getOne('SELECT * FROM clinic_info WHERE id = 1');
  const service = appointment.service_id
    ? await db.getOne('SELECT name, price_from FROM services WHERE id = ?', [appointment.service_id])
    : null;

  const dateStr = appointment.appointment_date;
  const timeStr = String(appointment.appointment_time).slice(0, 5);
  const clinicName = clinic?.name || 'МедКлиника';
  const address = clinic?.address || '';

  const smsBody = `${clinicName}: запись подтверждена ${dateStr} в ${timeStr}. Адрес: ${address}. Тел: ${clinic?.phone || ''}`;
  const emailSubject = `Запись на приём — ${clinicName}`;
  const emailBody = `
    <p>Здравствуйте, ${appointment.patient_name}!</p>
    <p>Ваша запись подтверждена:</p>
    <ul>
      <li><strong>Дата:</strong> ${dateStr}</li>
      <li><strong>Время:</strong> ${timeStr}</li>
      <li><strong>Услуга:</strong> ${service?.name || 'Консультация'}</li>
      <li><strong>Адрес:</strong> ${address}</li>
    </ul>
    <p>Телефон клиники: ${clinic?.phone || ''}</p>
  `;

  if (appointment.patient_phone) {
    await db.run(`
      INSERT INTO notification_queue (appointment_id, channel, recipient, subject, body)
      VALUES (?, 'sms', ?, ?, ?)
    `, [appointment.id, appointment.patient_phone, null, smsBody]);
  }

  if (appointment.patient_email) {
    await db.run(`
      INSERT INTO notification_queue (appointment_id, channel, recipient, subject, body)
      VALUES (?, 'email', ?, ?, ?)
    `, [appointment.id, appointment.patient_email, emailSubject, emailBody]);
  }
}

async function sendSms(phone, text) {
  if (!config.sms.apiId) {
    console.log('[SMS mock]', phone, text);
    return { success: true, mock: true };
  }

  const params = new URLSearchParams({
    api_id: config.sms.apiId,
    to: phone.replace(/\D/g, ''),
    msg: text,
    json: '1',
  });
  if (config.sms.from) params.set('from', config.sms.from);

  const res = await fetch(`https://sms.ru/sms/send?${params}`);
  const data = await res.json();
  if (data.status !== 'OK') throw new Error(data.status_text || 'SMS error');
  return data;
}

async function sendEmail(to, subject, html) {
  if (!config.smtp.host) {
    console.log('[Email mock]', to, subject);
    return { success: true, mock: true };
  }

  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });

  await transporter.sendMail({
    from: config.smtp.from,
    to,
    subject,
    html,
  });
  return { success: true };
}

async function processQueue(limit = 20) {
  const pending = await db.getAll(`
    SELECT * FROM notification_queue WHERE status = 'pending' ORDER BY created_at LIMIT ?
  `, [limit]);

  for (const item of pending) {
    try {
      if (item.channel === 'sms') {
        await sendSms(item.recipient, item.body);
      } else {
        await sendEmail(item.recipient, item.subject, item.body);
      }
      await db.run(`
        UPDATE notification_queue SET status = 'sent', sent_at = CURRENT_TIMESTAMP WHERE id = ?
      `, [item.id]);
    } catch (err) {
      await db.run(`
        UPDATE notification_queue SET status = 'failed', error_message = ? WHERE id = ?
      `, [err.message, item.id]);
    }
  }

  return pending.length;
}

module.exports = { queueAppointmentNotifications, processQueue, sendSms, sendEmail };
