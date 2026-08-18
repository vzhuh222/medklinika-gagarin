const express = require('express');
const db = require('../db');
const { normalizePhone } = require('../utils/phone');
const { logConsent, afterAppointmentCreated } = require('../services');

const router = express.Router();

router.get('/services', async (_req, res) => {
  const services = await db.getAll(`
    SELECT id, name, category, description, price_from, duration_min
    FROM services WHERE is_active = 1
    ORDER BY sort_order, name
  `);
  res.json(services);
});

router.get('/clinic', async (_req, res) => {
  const clinic = await db.getOne('SELECT * FROM clinic_info WHERE id = 1');
  res.json(clinic);
});

router.post('/appointments', async (req, res) => {
  const {
    slot_id, staff_id, service_id, patient_name, patient_phone, patient_email,
    comment, consent_accepted, pay_online,
  } = req.body;

  if (!patient_name || !patient_phone) {
    return res.status(400).json({ error: 'Заполните имя и телефон' });
  }
  if (!consent_accepted) {
    return res.status(400).json({ error: 'Необходимо согласие на обработку персональных данных' });
  }

  const phoneNorm = normalizePhone(patient_phone);
  if (phoneNorm.length < 12) {
    return res.status(400).json({ error: 'Введите корректный номер телефона' });
  }

  try {
    const consentId = await logConsent({
      patient_name,
      patient_phone,
      patient_email,
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    const booked = await db.transaction(async (tx) => {
      let date, time, doctorId, resolvedSlotId;

      if (slot_id) {
        const slot = await tx.getOne('SELECT * FROM time_slots WHERE id = ?', [slot_id]);
        if (!slot) throw new Error('Выбранное время недоступно');
        if (slot.status !== 'available') throw new Error('Это время уже занято');
        date = slot.slot_date;
        time = slot.slot_time;
        doctorId = slot.staff_id;
        resolvedSlotId = slot.id;
      } else {
        throw new Error('Выберите время приёма');
      }

      const insertSql = `
        INSERT INTO appointments (staff_id, service_id, slot_id, appointment_date, appointment_time,
          patient_name, patient_phone, patient_phone_normalized, patient_email, comment, status, consent_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
        RETURNING *
      `;

      let appointment;
      try {
        const result = await tx.run(insertSql, [
          doctorId, service_id || null, resolvedSlotId,
          date, time, patient_name, patient_phone, phoneNorm, patient_email || null,
          comment || null, consentId,
        ]);
        appointment = result.rows?.[0];
      } catch {
        const result = await tx.run(`
          INSERT INTO appointments (staff_id, service_id, slot_id, appointment_date, appointment_time,
            patient_name, patient_phone, patient_phone_normalized, patient_email, comment, status, consent_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?)
        `, [
          doctorId, service_id || null, resolvedSlotId,
          date, time, patient_name, patient_phone, phoneNorm, patient_email || null,
          comment || null, consentId,
        ]);
        appointment = await tx.getOne('SELECT * FROM appointments WHERE id = ?', [result.lastInsertRowid]);
      }

      await tx.run(`
        UPDATE time_slots SET status = 'booked', appointment_id = ? WHERE id = ? AND status = 'available'
      `, [appointment.id, resolvedSlotId]);

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

router.get('/appointments', async (req, res) => {
  const { staff_id } = req.query;
  let query = `
    SELECT a.*, s.first_name || ' ' || s.last_name AS doctor_name, sv.name AS service_name
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
  `;
  const params = [];
  if (staff_id) {
    query += ' WHERE a.staff_id = ?';
    params.push(staff_id);
  }
  query += ' ORDER BY a.appointment_date DESC, a.appointment_time DESC';
  res.json(await db.getAll(query, params));
});

router.patch('/appointments/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['pending', 'confirmed', 'cancelled', 'completed'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: 'Недопустимый статус' });
  }

  const appt = await db.getOne('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!appt) return res.status(404).json({ error: 'Запись не найдена' });

  await db.transaction(async (tx) => {
    await tx.run('UPDATE appointments SET status = ? WHERE id = ?', [status, req.params.id]);
    if (status === 'cancelled' && appt.slot_id) {
      await tx.run(`UPDATE time_slots SET status = 'available', appointment_id = NULL WHERE id = ?`, [appt.slot_id]);
    }
  });

  res.json({ success: true });
});

module.exports = router;
