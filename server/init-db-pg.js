const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { getPool } = require('./db/postgres');

const SCHEMA_PATH = path.join(__dirname, '..', 'database', 'schema.pg.sql');
const SEED_PATH = path.join(__dirname, '..', 'database', 'seed.sql');

async function initPostgresDatabase() {
  const pool = getPool();
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  await pool.query(schema);

  const seed = fs.readFileSync(SEED_PATH, 'utf8');
  const seedStatements = seed
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));

  for (const stmt of seedStatements) {
    try {
      let pgStmt = stmt
        .replace(/INSERT OR IGNORE/gi, 'INSERT')
        .replace(/datetime\('now'\)/gi, 'NOW()')
        .replace(/INTEGER NOT NULL DEFAULT 1/gi, 'BOOLEAN NOT NULL DEFAULT TRUE');
      await pool.query(pgStmt + ' ON CONFLICT DO NOTHING');
    } catch (err) {
      if (!err.message.includes('duplicate') && !err.message.includes('already exists')) {
        console.warn('Seed warning:', err.message.slice(0, 120));
      }
    }
  }

  const adminHash = bcrypt.hashSync('admin123', 10);
  const doctorHash = bcrypt.hashSync('doctor123', 10);

  await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [adminHash, 'admin@medklinika.ru']);
  await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [doctorHash, 'smirnova@medklinika.ru']);

  const insertSlot = `
    INSERT INTO time_slots (staff_id, slot_date, slot_time, duration_min, status)
    VALUES ($1, $2, $3, 30, 'available')
    ON CONFLICT DO NOTHING
  `;

  for (let day = 1; day <= 14; day++) {
    const d = new Date();
    d.setDate(d.getDate() + day);
    const dateStr = d.toISOString().split('T')[0];
    const weekday = d.getDay();
    if (weekday === 0) continue;

    const times = weekday === 6
      ? ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30']
      : ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'];

    for (const time of times) {
      await pool.query(insertSlot, [1, dateStr, time]);
      await pool.query(insertSlot, [2, dateStr, time]);
    }
  }

  console.log('PostgreSQL база данных инициализирована');
}

if (require.main === module) {
  require('dotenv').config();
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL обязателен. Пример: postgresql://user:pass@localhost:5432/medklinika');
    process.exit(1);
  }
  initPostgresDatabase()
    .then(() => process.exit(0))
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { initPostgresDatabase };
