const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const activeOnly = req.query.active !== 'false';
  const staff = await db.getAll(`
    SELECT id, first_name, last_name, middle_name, specialty, position, qualification,
           experience_years, education, photo_url, description, schedule, phone, email, is_active, sort_order
    FROM staff
    ${activeOnly ? 'WHERE is_active = 1' : ''}
    ORDER BY sort_order, last_name
  `);
  res.json(staff);
});

router.get('/:id', async (req, res) => {
  const member = await db.getOne(`
    SELECT id, first_name, last_name, middle_name, specialty, position, qualification,
           experience_years, education, photo_url, description, schedule, phone, email, is_active
    FROM staff WHERE id = ?
  `, [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Сотрудник не найден' });
  res.json(member);
});

router.post('/', async (req, res) => {
  const {
    first_name, last_name, middle_name, specialty, position, qualification,
    experience_years, education, photo_url, description, schedule, phone, email, sort_order,
  } = req.body;

  if (!first_name || !last_name || !specialty) {
    return res.status(400).json({ error: 'Заполните имя, фамилию и специальность' });
  }

  const result = await db.run(`
    INSERT INTO staff (first_name, last_name, middle_name, specialty, position, qualification,
                       experience_years, education, photo_url, description, schedule, phone, email, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    first_name, last_name, middle_name || null, specialty, position || 'врач',
    qualification || null, experience_years || 0, education || null, photo_url || null,
    description || null, schedule || null, phone || null, email || null, sort_order || 0,
  ]);

  const member = await db.getOne('SELECT * FROM staff WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(member);
});

router.put('/:id', async (req, res) => {
  const existing = await db.getOne('SELECT id FROM staff WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Сотрудник не найден' });

  const fields = [
    'first_name', 'last_name', 'middle_name', 'specialty', 'position', 'qualification',
    'experience_years', 'education', 'photo_url', 'description', 'schedule', 'phone', 'email', 'is_active', 'sort_order',
  ];

  const updates = [];
  const values = [];
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }
  if (updates.length === 0) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(req.params.id);

  await db.run(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`, values);
  const member = await db.getOne('SELECT * FROM staff WHERE id = ?', [req.params.id]);
  res.json(member);
});

router.delete('/:id', async (req, res) => {
  const result = await db.run(`
    UPDATE staff SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `, [req.params.id]);
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Сотрудник не найден' });
  }
  res.json({ success: true });
});

module.exports = router;
