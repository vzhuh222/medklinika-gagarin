const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'database', 'medklinika.db');
const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.sql');
const SEED_PATH = path.join(__dirname, '..', 'database', 'seed.sql');
const SCHEMA_VERSION = 5;
const VERSION_FILE = path.join(__dirname, '..', 'database', '.schema_version');

function initDatabase() {
  const dbDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  let currentVersion = 0;
  if (fs.existsSync(VERSION_FILE)) {
    currentVersion = parseInt(fs.readFileSync(VERSION_FILE, 'utf8'), 10) || 0;
  }

  if (currentVersion < SCHEMA_VERSION && fs.existsSync(DB_PATH)) {
    fs.unlinkSync(DB_PATH);
  }

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  db.exec(schema);

  const seed = fs.readFileSync(SEED_PATH, 'utf8');
  db.exec(seed);

  const migrations = [
    'ALTER TABLE appointments ADD COLUMN patient_email TEXT',
    "ALTER TABLE appointments ADD COLUMN payment_status TEXT DEFAULT 'none'",
    'ALTER TABLE appointments ADD COLUMN medflex_external_id TEXT',
    "ALTER TABLE appointments ADD COLUMN sync_status TEXT DEFAULT 'local'",
    'ALTER TABLE appointments ADD COLUMN consent_id INTEGER',
    'ALTER TABLE staff ADD COLUMN medflex_doctor_id TEXT',
    'ALTER TABLE services ADD COLUMN medflex_service_id TEXT',
  ];
  for (const sql of migrations) {
    try { db.exec(sql); } catch (_) { /* column exists */ }
  }

  const adminHash = bcrypt.hashSync('admin123', 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE email = ?').run(adminHash, 'admin@medklinika.ru');

  db.close();
  fs.writeFileSync(VERSION_FILE, String(SCHEMA_VERSION));
  console.log('База данных успешно инициализирована:', DB_PATH);
}

if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase, DB_PATH };
