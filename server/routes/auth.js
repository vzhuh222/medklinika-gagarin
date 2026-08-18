const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auditAccess } = require('../services/personal-data');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const user = await db.getOne(`
    SELECT u.*, s.specialty, s.position AS staff_position
    FROM users u
    LEFT JOIN staff s ON u.staff_id = s.id
    WHERE u.email = ? AND u.is_active = 1
  `, [email]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  await auditAccess({
    user_id: user.id,
    staff_id: user.staff_id,
    action: 'login',
    entity_type: 'user',
    entity_id: user.id,
    ip_address: req.ip,
  });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      staff_id: user.staff_id,
      specialty: user.specialty || null,
    },
  });
});

router.get('/accounts', async (_req, res) => {
  const accounts = await db.getAll(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.staff_id, u.is_active, u.created_at,
           s.specialty, s.last_name || ' ' || s.first_name AS staff_name
    FROM users u
    LEFT JOIN staff s ON u.staff_id = s.id
    ORDER BY u.role, u.last_name
  `);
  res.json(accounts);
});

router.post('/accounts', async (req, res) => {
  const { email, password, first_name, last_name, role, staff_id } = req.body;

  if (!email || !password || !first_name || !last_name || !role) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }
  if (!['admin', 'doctor'].includes(role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 6 символов' });
  }

  const existing = await db.getOne('SELECT id FROM users WHERE email = ?', [email]);
  if (existing) {
    return res.status(409).json({ error: 'Учётная запись с таким email уже существует' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = await db.run(`
    INSERT INTO users (email, password_hash, first_name, last_name, role, staff_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [email, password_hash, first_name, last_name, role, staff_id || null]);

  const account = await db.getOne(`
    SELECT id, email, first_name, last_name, role, staff_id, is_active, created_at
    FROM users WHERE id = ?
  `, [result.lastInsertRowid]);
  res.status(201).json(account);
});

module.exports = router;
