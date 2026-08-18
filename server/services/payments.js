const config = require('../config');
const db = require('../db');

async function createPayment(appointmentId) {
  if (!config.yookassa.shopId || !config.yookassa.secretKey) {
    throw new Error('ЮKassa не настроена. Укажите YOOKASSA_SHOP_ID и YOOKASSA_SECRET_KEY в .env');
  }

  const appointment = await db.getOne(`
    SELECT a.*, sv.name AS service_name, sv.price_from
    FROM appointments a
    LEFT JOIN services sv ON a.service_id = sv.id
    WHERE a.id = ?
  `, [appointmentId]);

  if (!appointment) throw new Error('Запись не найдена');

  const amount = parseFloat(appointment.price_from) || 0;
  if (amount <= 0) throw new Error('Для этой услуги не указана цена для оплаты');

  const idempotenceKey = `appt-${appointmentId}-${Date.now()}`;
  const auth = Buffer.from(`${config.yookassa.shopId}:${config.yookassa.secretKey}`).toString('base64');

  const body = {
    amount: { value: amount.toFixed(2), currency: 'RUB' },
    capture: true,
    confirmation: {
      type: 'redirect',
      return_url: `${config.siteUrl}/payment-success.html?appointment_id=${appointmentId}`,
    },
    description: `Запись: ${appointment.service_name || 'Приём'} — ${appointment.patient_name}`,
    metadata: { appointment_id: String(appointmentId) },
  };

  const res = await fetch('https://api.yookassa.ru/v3/payments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
      'Idempotence-Key': idempotenceKey,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.description || 'Ошибка создания платежа');

  await db.run(`
    INSERT INTO payments (appointment_id, amount, currency, yookassa_payment_id, status, confirmation_url)
    VALUES (?, ?, 'RUB', ?, ?, ?)
  `, [appointmentId, amount, data.id, data.status, data.confirmation?.confirmation_url || null]);

  await db.run(`
    UPDATE appointments SET payment_status = 'pending' WHERE id = ?
  `, [appointmentId]);

  return {
    paymentId: data.id,
    confirmationUrl: data.confirmation?.confirmation_url,
    status: data.status,
  };
}

async function handleWebhook(event) {
  const payment = event.object;
  if (!payment?.id) return;

  const local = await db.getOne('SELECT * FROM payments WHERE yookassa_payment_id = ?', [payment.id]);
  if (!local) return;

  await db.run(`
    UPDATE payments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE yookassa_payment_id = ?
  `, [payment.status, payment.id]);

  if (payment.status === 'succeeded') {
    await db.run(`
      UPDATE appointments SET payment_status = 'paid', status = 'confirmed' WHERE id = ?
    `, [local.appointment_id]);
  }

  if (payment.status === 'canceled') {
    await db.run(`
      UPDATE appointments SET payment_status = 'none' WHERE id = ?
    `, [local.appointment_id]);
  }
}

module.exports = { createPayment, handleWebhook };
