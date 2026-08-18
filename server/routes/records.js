const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { normalizePhone } = require('../utils/phone');
const { auditAccess } = require('../services/personal-data');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      cb(null, Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.get('/appointments/:id', async (req, res) => {
  const appointment = await db.getOne(`
    SELECT a.*, s.first_name || ' ' || s.last_name AS doctor_name, s.specialty,
           sv.name AS service_name
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
    WHERE a.id = ?
  `, [req.params.id]);

  if (!appointment) return res.status(404).json({ error: 'Запись не найдена' });

  await auditAccess({
    staff_id: appointment.staff_id,
    action: 'read',
    entity_type: 'appointment',
    entity_id: appointment.id,
    ip_address: req.ip,
    details: 'Просмотр карточки пациента',
  });

  const records = await db.getAll(`
    SELECT pr.*, st.first_name || ' ' || st.last_name AS author_name
    FROM patient_records pr
    JOIN staff st ON pr.staff_id = st.id
    WHERE pr.appointment_id = ?
    ORDER BY pr.created_at DESC
  `, [req.params.id]);

  const files = await db.getAll(`
    SELECT pf.*, st.first_name || ' ' || st.last_name AS author_name
    FROM patient_files pf
    JOIN staff st ON pf.staff_id = st.id
    WHERE pf.appointment_id = ?
    ORDER BY pf.created_at DESC
  `, [req.params.id]);

  res.json({ appointment, records, files });
});

router.get('/patients/history', async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone || phone.length < 12) {
    return res.status(400).json({ error: 'Укажите корректный телефон' });
  }

  const history = await db.getAll(`
    SELECT a.*, s.first_name || ' ' || s.last_name AS doctor_name, s.specialty,
           sv.name AS service_name
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
    WHERE a.patient_phone_normalized = ?
    ORDER BY a.appointment_date DESC, a.appointment_time DESC
  `, [phone]);

  res.json(history);
});

router.post('/appointments/:id/records', async (req, res) => {
  const { staff_id, record_type, title, content } = req.body;
  if (!staff_id || !content) {
    return res.status(400).json({ error: 'Заполните текст записи' });
  }

  const appointment = await db.getOne('SELECT id FROM appointments WHERE id = ?', [req.params.id]);
  if (!appointment) return res.status(404).json({ error: 'Запись не найдена' });

  const result = await db.run(`
    INSERT INTO patient_records (appointment_id, staff_id, record_type, title, content)
    VALUES (?, ?, ?, ?, ?)
  `, [req.params.id, staff_id, record_type || 'note', title || null, content]);

  await auditAccess({
    staff_id,
    action: 'create',
    entity_type: 'patient_record',
    entity_id: result.lastInsertRowid,
    ip_address: req.ip,
  });

  const record = await db.getOne('SELECT * FROM patient_records WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(record);
});

router.post('/appointments/:id/files', upload.single('file'), async (req, res) => {
  const { staff_id, description } = req.body;
  if (!staff_id || !req.file) {
    return res.status(400).json({ error: 'Выберите файл' });
  }

  const appointment = await db.getOne('SELECT id FROM appointments WHERE id = ?', [req.params.id]);
  if (!appointment) {
    fs.unlinkSync(req.file.path);
    return res.status(404).json({ error: 'Запись не найдена' });
  }

  const result = await db.run(`
    INSERT INTO patient_files (appointment_id, staff_id, original_name, stored_name, mime_type, file_size, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    req.params.id, staff_id, req.file.originalname, req.file.filename,
    req.file.mimetype, req.file.size, description || null,
  ]);

  const file = await db.getOne('SELECT * FROM patient_files WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(file);
});

router.get('/files/:id/download', async (req, res) => {
  const file = await db.getOne('SELECT * FROM patient_files WHERE id = ?', [req.params.id]);
  if (!file) return res.status(404).json({ error: 'Файл не найден' });

  const filePath = path.join(UPLOAD_DIR, file.stored_name);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл не найден на диске' });
  }
  res.download(filePath, file.original_name);
});

module.exports = router;
