const express = require('express');
const { createPayment, handleWebhook } = require('../services/payments');
const db = require('../db');

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { appointment_id } = req.body;
    if (!appointment_id) return res.status(400).json({ error: 'Укажите appointment_id' });

    const appointment = await db.getOne(
      'SELECT id, payment_status FROM appointments WHERE id = ?',
      [appointment_id],
    );
    if (!appointment) return res.status(404).json({ error: 'Запись не найдена' });
    if (appointment.payment_status === 'paid') {
      return res.status(409).json({ error: 'Приём уже оплачен' });
    }

    const result = await createPayment(appointment_id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    await handleWebhook(req.body);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/status/:appointmentId', async (req, res) => {
  const payment = await db.getOne(`
    SELECT appointment_id, amount, currency, status, created_at
    FROM payments WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1
  `, [req.params.appointmentId]);
  res.json(payment || { status: 'none' });
});

module.exports = router;
