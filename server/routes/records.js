const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { normalizePhone } = require('../utils/phone');
const { auditAccess } = require('../services/personal-data');
const { requireAuth, staffScope } = require('../middleware/auth');

const router = express.Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_MIME = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/heic',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10).replace(/[^\w.]/g, '');
      cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Недопустимый тип файла. Разрешены изображения, PDF и документы.'));
    }
    cb(null, true);
  },
});

async function loadAppointmentForUser(appointmentId, user) {
  const appointment = await db.getOne(`
    SELECT a.*, s.first_name || ' ' || s.last_name AS doctor_name, s.specialty,
           sv.name AS service_name
    FROM appointments a
    LEFT JOIN staff s ON a.staff_id = s.id
    LEFT JOIN services sv ON a.service_id = sv.id
    WHERE a.id = ?
  `, [appointmentId]);

  if (!appointment) return { error: 'notFound' };

  const scope = staffScope(user);
  if (scope !== null && appointment.staff_id !== scope) return { error: 'forbidden' };

  return { appointment };
}

router.get('/appointments/:id', requireAuth, async (req, res) => {
  const { appointment, error } = await loadAppointmentForUser(req.params.id, req.user);
  if (error === 'notFound') return res.status(404).json({ error: 'Запись не найдена' });
  if (error === 'forbidden') return res.status(403).json({ error: 'Запись другого врача' });

  await auditAccess({
    user_id: req.user.id,
    staff_id: req.user.staff_id,
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

router.get('/patients/history', requireAuth, async (req, res) => {
  const phone = normalizePhone(req.query.phone);
  if (!phone || phone.length < 12) {
    return res.status(400).json({ error: 'Укажите корректный телефон' });
  }

  const scope = staffScope(req.user);
  if (scope !== null) {
    const seenByDoctor = await db.getOne(`
      SELECT id FROM appointments WHERE patient_phone_normalized = ? AND staff_id = ? LIMIT 1
    `, [phone, scope]);
    if (!seenByDoctor) {
      return res.status(403).json({ error: 'Пациент не записан к вам на приём' });
    }
  }

  await auditAccess({
    user_id: req.user.id,
    staff_id: req.user.staff_id,
    action: 'read',
    entity_type: 'patient_history',
    ip_address: req.ip,
    details: 'Просмотр истории визитов пациента',
  });

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

router.post('/appointments/:id/records', requireAuth, async (req, res) => {
  const { record_type, title, content } = req.body;
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: 'Заполните текст записи' });
  }

  const { appointment, error } = await loadAppointmentForUser(req.params.id, req.user);
  if (error === 'notFound') return res.status(404).json({ error: 'Запись не найдена' });
  if (error === 'forbidden') return res.status(403).json({ error: 'Запись другого врача' });

  const authorStaffId = req.user.staff_id || appointment.staff_id;
  if (!authorStaffId) {
    return res.status(400).json({ error: 'Учётная запись не привязана к сотруднику' });
  }

  const allowedTypes = ['note', 'procedure', 'result', 'diagnosis'];
  const type = allowedTypes.includes(record_type) ? record_type : 'note';

  const result = await db.run(`
    INSERT INTO patient_records (appointment_id, staff_id, record_type, title, content)
    VALUES (?, ?, ?, ?, ?)
  `, [req.params.id, authorStaffId, type, title || null, String(content).trim()]);

  await auditAccess({
    user_id: req.user.id,
    staff_id: authorStaffId,
    action: 'create',
    entity_type: 'patient_record',
    entity_id: result.lastInsertRowid,
    ip_address: req.ip,
  });

  const record = await db.getOne('SELECT * FROM patient_records WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(record);
});

router.post('/appointments/:id/files', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Выберите файл' });
  }

  const { appointment, error } = await loadAppointmentForUser(req.params.id, req.user);
  if (error) {
    fs.unlink(req.file.path, () => {});
    return res.status(error === 'notFound' ? 404 : 403)
      .json({ error: error === 'notFound' ? 'Запись не найдена' : 'Запись другого врача' });
  }

  const authorStaffId = req.user.staff_id || appointment.staff_id;
  if (!authorStaffId) {
    fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: 'Учётная запись не привязана к сотруднику' });
  }

  const result = await db.run(`
    INSERT INTO patient_files (appointment_id, staff_id, original_name, stored_name, mime_type, file_size, description)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    req.params.id, authorStaffId, req.file.originalname, req.file.filename,
    req.file.mimetype, req.file.size, req.body.description || null,
  ]);

  const file = await db.getOne('SELECT * FROM patient_files WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(file);
});

router.get('/files/:id/download', requireAuth, async (req, res) => {
  const file = await db.getOne(`
    SELECT pf.*, a.staff_id AS appointment_staff_id
    FROM patient_files pf
    JOIN appointments a ON pf.appointment_id = a.id
    WHERE pf.id = ?
  `, [req.params.id]);

  if (!file) return res.status(404).json({ error: 'Файл не найден' });

  const scope = staffScope(req.user);
  if (scope !== null && file.appointment_staff_id !== scope) {
    return res.status(403).json({ error: 'Файл другого врача' });
  }

  const filePath = path.join(UPLOAD_DIR, path.basename(file.stored_name));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Файл не найден на диске' });
  }

  await auditAccess({
    user_id: req.user.id,
    staff_id: req.user.staff_id,
    action: 'read',
    entity_type: 'patient_file',
    entity_id: file.id,
    ip_address: req.ip,
    details: 'Скачивание файла пациента',
  });

  res.download(filePath, file.original_name);
});

module.exports = router;
