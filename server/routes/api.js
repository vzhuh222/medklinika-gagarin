const express = require('express');
const db = require('../db');
const { normalizePhone } = require('../utils/phone');
const { logConsent, afterAppointmentCreated, afterAppointmentStatusChanged } = require('../services');
const { requireAuth, requireAdmin, staffScope } = require('../middleware/auth');

const router = express.Router();

const BOOKING_WINDOW_MS = 10 * 60 * 1000;
const BOOKING_LIMIT = 5;
const bookingAttempts = new Map();

function tooManyBookings(ip) {
  const now = Date.now();
  const entry = bookingAttempts.get(ip);
  if (!entry || now - entry.firstAt > BOOKING_WINDOW_MS) {
    bookingAttempts.set(ip, { count: 1, firstAt: now });
    return false;
  }
  entry.count += 1;
  return entry.count > BOOKING_LIMIT;
}

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of bookingAttempts) {
    if (now - entry.firstAt > BOOKING_WINDOW_MS) bookingAttempts.delete(ip);
  }
}, BOOKING_WINDOW_MS).unref();

router.get('/services', async (_req, res) => {
  const services = await db.getAll(`
    SELECT id, name, category, description, price_from, duration_min
    FROM services WHERE is_active = 1
    ORDER BY sort_order, name
  `);
  res.json(services);
});

router.get('/services/all', requireAdmin, async (_req, res) => {
  const services = await db.getAll(`
    SELECT id, name, category, description, price_from, duration_min, medflex_service_id, is_active, sort_order
    FROM services ORDER BY sort_order, name
  `);
  res.json(services);
});

router.get('/clinic', async (_req, res) => {
  const clinic = await db.getOne('SELECT * FROM clinic_info WHERE id = 1');
  res.json(clinic);
});

router.post('/appointments', async (req, res) => {
  const {
    slot_id, service_id, patient_name, patient_phone, patient_email,
    comment, consent_accepted, pay_online,
  } = req.body;

  if (tooManyBookings(req.ip)) {
    return res.status(429).json({ error: 'Слишком много заявок. Попробуйте позже или позвоните нам.' });
  }

  const name = String(patient_name || '').trim();
  if (name.length < 3 || name.length > 120) {
    return res.status(400).json({ error: 'Укажите полное имя (от 3 символов)' });
  }
  if (!consent_accepted) {
    return res.status(400).json({ error: 'Необходимо согласие на обработку персональных данных' });
  }
  if (comment && String(comment).length > 1000) {
    return res.status(400).json({ error: 'Комментарий слишком длинный' });
  }

  const email = patient_email ? String(patient_email).trim() : null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Введите корректный email' });
  }

  const phoneNorm = normalizePhone(patient_phone);
  if (phoneNorm.length < 12) {
    return res.status(400).json({ error: 'Введите корректный номер телефона' });
  }

  try {
    const consentId = await logConsent({
      patient_name: name,
      patient_phone,
      patient_email: email,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    const booked = await db.transaction(async (tx) => {
      if (!slot_id) throw new Error('Выберите время приёма');

      const slot = await tx.getOne('SELECT * FROM time_slots WHERE id = ?', [slot_id]);
      if (!slot) throw new Error('Выбранное время недоступно');
      if (slot.status !== 'available') throw new Error('Это время уже занято');

      const date = slot.slot_date;
      const time = slot.slot_time;
      const doctorId = slot.staff_id;
      const resolvedSlotId = slot.id;

      const columns = `staff_id, service_id, slot_id, appointment_date, appointment_time,
          patient_name, patient_phone, patient_phone_normalized, patient_email, comment, status, consent_id`;
      const values = [
        doctorId, service_id || null, resolvedSlotId,
        date, time, name, patient_phone, phoneNorm, email,
        comment || null, consentId,
      ];

      let appointment;
      try {
        const result = await tx.run(`
          INSERT INTO appointments (${columns})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
          RETURNING *
        `, values);
        appointment = result.rows?.[0];
      } catch {
        appointment = undefined;
      }

      if (!appointment) {
        const result = await tx.run(`
          INSERT INTO appointments (${columns})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
        `, values);
        appointment = await tx.getOne('SELECT * FROM appointments WHERE id = ?', [result.lastInsertRowid]);
      }

      const claimed = await tx.run(`
        UPDATE time_slots SET status = 'booked', appointment_id = ? WHERE id = ? AND status = 'available'
      `, [appointment.id, resolvedSlotId]);

      if (claimed.rowCount === 0) throw new Error('Это время уже занято');

      return appointment;
    });

    afterAppointmentCreated(booked, req).catch(console.error);

    const response = {
      id: booked.id,
      appointment_date: booked.appointment_date,
      appointment_time: String(booked.appointment_time).slice(0, 5),
      message: 'Запись успешно оформлена',
      paymentAvailable: Boolean(pay_online && service_id),
    };

    if (pay_online && service_id) {
      try {
        const { createPayment } = require('../services/payments');
        const payment = await createPayment(booked.id);
        response.paymentUrl = payment.confirmationUrl;
      } catch (err) {
        response.paymentError = err.message;
      }
    }

    res.status(201).json(response);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/appointments', requireAuth, async (req, res) => {
  const scope = staffScope(req.user);
  const requestedStaffId = req.query.staff_id ? parseInt(req.query.staff_id, 10) : null;

  const conditions = [];
  const params = [];

  if (scope !== null) {
    conditions.push('a.staff_id = ?');
    params.push(scope);
  } else if (requestedStaffId) {
    conditions.push('a.staff_id = ?');
    params.push(requestedStaffId);
  }

  const query = `
    SELECT a.*, s.first_name || ' ' || s.last_name AS doctor_name, sv.name AS service_name
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
    ${conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''}
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
  `;

  res.json(await db.getAll(query, params));
});

router.patch('/appointments/:id/status', requireAuth, async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }

  const appt = await db.getOne('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!appt) return res.status(404).json({ error: 'Запись не найдена' });

  const scope = staffScope(req.user);
  if (scope !== null && appt.staff_id !== scope) {
    return res.status(403).json({ error: 'Запись другого врача' });
  }

  await db.transaction(async (tx) => {
    await tx.run('UPDATE appointments SET status = ? WHERE id = ?', [status, req.params.id]);
    if (status === 'cancelled' && appt.slot_id) {
      await tx.run(`UPDATE time_slots SET status = 'available', appointment_id = NULL WHERE id = ?`, [appt.slot_id]);
    }
  });

  afterAppointmentStatusChanged(parseInt(req.params.id, 10), status, req).catch(console.error);

  res.json({ success: true });
});

module.exports = router;
