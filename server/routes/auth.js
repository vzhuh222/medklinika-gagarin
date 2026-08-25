const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auditAccess } = require('../services/personal-data');
const { createSession, destroySession, SESSION_TTL_HOURS } = require('../services/sessions');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = express.Router();

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const loginAttempts = new Map();

function attemptKey(req, email) {
  return `${req.ip}|${String(email || '').toLowerCase()}`;
}

function isLockedOut(key) {
  const entry = loginAttempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > LOCKOUT_MS) {
    loginAttempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function registerFailure(key) {
  const entry = loginAttempts.get(key);
  if (!entry || Date.now() - entry.firstAt > LOCKOUT_MS) {
    loginAttempts.set(key, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Введите email и пароль' });
  }

  const key = attemptKey(req, email);
  if (isLockedOut(key)) {
    return res.status(429).json({ error: 'Слишком много попыток входа. Повторите через 15 минут.' });
  }

  const user = await db.getOne(`
    SELECT u.*, s.specialty, s.position AS staff_position
    FROM users u
    LEFT JOIN staff s ON u.staff_id = s.id
    WHERE u.email = ? AND u.is_active = 1
  `, [String(email).trim().toLowerCase()]);

  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    registerFailure(key);
    return res.status(401).json({ error: 'Неверный email или пароль' });
  }

  loginAttempts.delete(key);
  const token = await createSession(user, req);

  await auditAccess({
    user_id: user.id,
    staff_id: user.staff_id,
    action: 'login',
    entity_type: 'user',
    entity_id: user.id,
    ip_address: req.ip,
  });

  res.json({
    token,
    expiresInHours: SESSION_TTL_HOURS,
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

router.post('/logout', async (req, res) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  await destroySession(token);
  res.json({ success: true });
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.get('/accounts', requireAdmin, async (_req, res) => {
  const accounts = await db.getAll(`
    SELECT u.id, u.email, u.first_name, u.last_name, u.role, u.staff_id, u.is_active, u.created_at,
           s.specialty, s.last_name || ' ' || s.first_name AS staff_name
    FROM users u
    LEFT JOIN staff s ON u.staff_id = s.id
    ORDER BY u.role, u.last_name
  `);
  res.json(accounts);
});

router.post('/accounts', requireAdmin, async (req, res) => {
  const { email, password, first_name, last_name, role, staff_id } = req.body;

  if (!email || !password || !first_name || !last_name || !role) {
    return res.status(400).json({ error: 'Заполните обязательные поля' });
  }
  if (!['admin', 'doctor'].includes(role)) {
    return res.status(400).json({ error: 'Недопустимая роль' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Пароль должен быть не менее 8 символов' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existing = await db.getOne('SELECT id FROM users WHERE email = ?', [normalizedEmail]);
  if (existing) {
    return res.status(409).json({ error: 'Учётная запись с таким email уже существует' });
  }

  const password_hash = bcrypt.hashSync(password, 10);
  const result = await db.run(`
    INSERT INTO users (email, password_hash, first_name, last_name, role, staff_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [normalizedEmail, password_hash, first_name, last_name, role, staff_id || null]);

  const account = await db.getOne(`
    SELECT id, email, first_name, last_name, role, staff_id, is_active, created_at
    FROM users WHERE id = ?
  `, [result.lastInsertRowid]);
  res.status(201).json(account);
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Укажите текущий и новый пароль' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'Новый пароль должен быть не менее 8 символов' });
  }

  const user = await db.getOne('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!user || !bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Текущий пароль неверен' });
  }

  await db.run('UPDATE users SET password_hash = ? WHERE id = ?', [bcrypt.hashSync(new_password, 10), req.user.id]);
  await db.run('DELETE FROM sessions WHERE user_id = ?', [req.user.id]);

  res.json({ success: true, message: 'Пароль изменён, войдите заново' });
});

module.exports = router;
