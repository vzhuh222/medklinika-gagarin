const express = require('express');
const db = require('../db');

const router = express.Router();

function generateTimeRange(startTime, endTime, intervalMin) {
  const slots = [];
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  let minutes = sh * 60 + sm;
  const endMinutes = eh * 60 + em;
  while (minutes + intervalMin <= endMinutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    minutes += intervalMin;
  }
  return slots;
}

router.get('/', async (req, res) => {
  const { staff_id, date, from, to, available } = req.query;
  if (!staff_id) return res.status(400).json({ error: 'Укажите врача' });

  let query = `
    SELECT ts.*, a.patient_name, a.patient_phone, a.status AS appointment_status
    FROM time_slots ts
    LEFT JOIN appointments a ON ts.appointment_id = a.id
    WHERE ts.staff_id = ?
  `;
  const params = [staff_id];

  if (date) {
    query += ' AND ts.slot_date = ?';
    params.push(date);
  } else if (from && to) {
    query += ' AND ts.slot_date BETWEEN ? AND ?';
    params.push(from, to);
  }
  if (available === 'true') {
    query += " AND ts.status = 'available'";
  }
  query += ' ORDER BY ts.slot_date, ts.slot_time';

  res.json(await db.getAll(query, params));
});

router.post('/generate', async (req, res) => {
  const { staff_id, date, start_time, end_time, interval_min } = req.body;
  if (!staff_id || !date || !start_time || !end_time) {
    return res.status(400).json({ error: 'Заполните дату и время приёма' });
  }

  const interval = interval_min || 30;
  const times = generateTimeRange(start_time, end_time, interval);
  let created = 0;

  for (const time of times) {
    try {
      const result = await db.run(`
        INSERT INTO time_slots (staff_id, slot_date, slot_time, duration_min, status)
        VALUES (?, ?, ?, ?, 'available')
        ON CONFLICT DO NOTHING
      `, [staff_id, date, time, interval]);
      if (result.rowCount > 0) created++;
    } catch {
      const result = await db.run(`
        INSERT OR IGNORE INTO time_slots (staff_id, slot_date, slot_time, duration_min, status)
        VALUES (?, ?, ?, ?, 'available')
      `, [staff_id, date, time, interval]);
      created += result.rowCount;
    }
  }

  res.status(201).json({ created, total: times.length });
});

router.delete('/:id', async (req, res) => {
  const slot = await db.getOne('SELECT * FROM time_slots WHERE id = ?', [req.params.id]);
  if (!slot) return res.status(404).json({ error: 'Слот не найден' });
  if (slot.status === 'booked') {
    return res.status(400).json({ error: 'Нельзя удалить занятый слот' });
  }
  await db.run('DELETE FROM time_slots WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
