const express = require('express');
const { createPayment, handleWebhook } = require('../services/payments');
const db = require('../db');

const router = express.Router();

router.post('/create', async (req, res) => {
  try {
    const { appointment_id } = req.body;
    if (!appointment_id) return res.status(400).json({ error: 'Укажите appointment_id' });
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
    SELECT * FROM payments WHERE appointment_id = ? ORDER BY created_at DESC LIMIT 1
  `, [req.params.appointmentId]);
  res.json(payment || { status: 'none' });
});

module.exports = router;
