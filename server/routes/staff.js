const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

const PUBLIC_FIELDS = `s.id, s.first_name, s.last_name, s.middle_name, s.specialty, s.position, s.qualification,
           s.experience_years, s.education, s.photo_url, s.description, s.schedule, s.sort_order`;

const FULL_FIELDS = `${PUBLIC_FIELDS}, s.phone, s.email, s.medflex_doctor_id, s.is_active,
           (SELECT u.email FROM users u WHERE u.staff_id = s.id AND u.role = 'doctor'
            ORDER BY u.id LIMIT 1) AS account_login`;

router.get('/', async (req, res) => {
  const isStaffUser = Boolean(req.user);
  const activeOnly = req.query.active !== 'false' || !isStaffUser;

  let where = '';
  if (activeOnly) {
    where = 'WHERE s.is_active = TRUE';
  }

  const staff = await db.getAll(`
    SELECT ${isStaffUser ? FULL_FIELDS : `${PUBLIC_FIELDS}, is_active`}
    FROM staff s
    ${where}
    ORDER BY s.sort_order, s.last_name
  `);
  res.json(staff);
});

router.get('/:id', async (req, res) => {
  const member = await db.getOne(`
    SELECT ${req.user ? FULL_FIELDS : `${PUBLIC_FIELDS}, is_active`}
    FROM staff s WHERE s.id = ?
  `, [req.params.id]);
  if (!member) return res.status(404).json({ error: 'Сотрудник не найден' });
  if (!req.user && !member.is_active) {
    return res.status(404).json({ error: 'Сотрудник не найден' });
  }
  res.json(member);
});

router.post('/', requireAdmin, async (req, res) => {
  const {
    first_name, last_name, middle_name, specialty, position, qualification,
    experience_years, education, photo_url, description, schedule, phone, email, sort_order,
    account_login, account_password,
  } = req.body;

  if (!first_name || !last_name || !specialty) {
    return res.status(400).json({ error: 'Заполните имя, фамилию и специальность' });
  }
  if (!account_login || !account_password) {
    return res.status(400).json({ error: 'Укажите логин и пароль для входа врача' });
  }
  if (String(account_password).length < 8) {
    return res.status(400).json({ error: 'Пароль должен содержать не менее 8 символов' });
  }

  const login = String(account_login).trim().toLowerCase();
  const existingAccount = await db.getOne('SELECT id FROM users WHERE email = ?', [login]);
  if (existingAccount) {
    return res.status(409).json({ error: 'Такой логин уже используется' });
  }

  const staffId = await db.transaction(async (tx) => {
    const result = await tx.run(`
      INSERT INTO staff (first_name, last_name, middle_name, specialty, position, qualification,
                         experience_years, education, photo_url, description, schedule, phone, email, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      RETURNING id
    `, [
      first_name, last_name, middle_name || null, specialty, position || 'врач',
      qualification || null, experience_years || 0, education || null, photo_url || null,
      description || null, schedule || null, phone || null, email || null, sort_order || 0,
    ]);
    const id = result.rows[0].id;

    await tx.run(`
      INSERT INTO users (email, password_hash, first_name, last_name, role, staff_id)
      VALUES (?, ?, ?, ?, 'doctor', ?)
    `, [login, bcrypt.hashSync(account_password, 10), first_name, last_name, id]);
    return id;
  });

  const member = await db.getOne(`SELECT ${FULL_FIELDS} FROM staff s WHERE s.id = ?`, [staffId]);
  res.status(201).json(member);
});

router.put('/:id', requireAdmin, async (req, res) => {
  const existing = await db.getOne(`
    SELECT s.id, u.id AS user_id, u.email AS account_login
    FROM staff s
    LEFT JOIN users u ON u.staff_id = s.id AND u.role = 'doctor'
    WHERE s.id = ?
  `, [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Сотрудник не найден' });

  const fields = [
    'first_name', 'last_name', 'middle_name', 'specialty', 'position', 'qualification',
    'experience_years', 'education', 'photo_url', 'description', 'schedule', 'phone', 'email',
    'medflex_doctor_id', 'is_active', 'sort_order',
  ];

  const updates = [];
  const values = [];
  for (const field of fields) {
    if (req.body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(req.body[field]);
    }
  }
  if (updates.length === 0 && req.body.account_login === undefined && !req.body.account_password) {
    return res.status(400).json({ error: 'Нет данных для обновления' });
  }

  updates.push("updated_at = CURRENT_TIMESTAMP");
  values.push(req.params.id);

  const login = req.body.account_login
    ? String(req.body.account_login).trim().toLowerCase()
    : existing.account_login;
  if (!login) {
    return res.status(400).json({ error: 'Укажите логин для входа врача' });
  }
  if (req.body.account_password && String(req.body.account_password).length < 8) {
    return res.status(400).json({ error: 'Пароль должен содержать не менее 8 символов' });
  }
  const duplicate = await db.getOne(
    'SELECT id FROM users WHERE email = ? AND id <> ?',
    [login, existing.user_id || 0],
  );
  if (duplicate) return res.status(409).json({ error: 'Такой логин уже используется' });

  await db.transaction(async (tx) => {
    await tx.run(`UPDATE staff SET ${updates.join(', ')} WHERE id = ?`, values);

    if (existing.user_id) {
      const userUpdates = ['email = ?', 'first_name = ?', 'last_name = ?', 'is_active = TRUE'];
      const userValues = [login, req.body.first_name, req.body.last_name];
      if (req.body.account_password) {
        userUpdates.push('password_hash = ?');
        userValues.push(bcrypt.hashSync(req.body.account_password, 10));
      }
      userUpdates.push('updated_at = CURRENT_TIMESTAMP');
      userValues.push(existing.user_id);
      await tx.run(`UPDATE users SET ${userUpdates.join(', ')} WHERE id = ?`, userValues);
    } else {
      if (!req.body.account_password) {
        throw new Error('Для врача без учётной записи необходимо задать новый пароль');
      }
      await tx.run(`
        INSERT INTO users (email, password_hash, first_name, last_name, role, staff_id)
        VALUES (?, ?, ?, ?, 'doctor', ?)
      `, [
        login, bcrypt.hashSync(req.body.account_password, 10),
        req.body.first_name, req.body.last_name, req.params.id,
      ]);
    }
  });

  const member = await db.getOne(`SELECT ${FULL_FIELDS} FROM staff s WHERE s.id = ?`, [req.params.id]);
  res.json(member);
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const result = await db.transaction(async (tx) => {
    const updated = await tx.run(`
      UPDATE staff SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `, [req.params.id]);
    await tx.run(`
      UPDATE users SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE staff_id = ?
    `, [req.params.id]);
    return updated;
  });
  if (result.rowCount === 0) {
    return res.status(404).json({ error: 'Сотрудник не найден' });
  }
  res.json({ success: true });
});

module.exports = router;
