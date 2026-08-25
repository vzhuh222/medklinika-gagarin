const crypto = require('crypto');
const db = require('../db');

const SESSION_TTL_HOURS = parseInt(process.env.SESSION_TTL_HOURS || '12', 10);

function expiryDate() {
  return new Date(Date.now() + SESSION_TTL_HOURS * 3600 * 1000);
}

async function createSession(user, req) {
  const token = crypto.randomBytes(32).toString('hex');
  await db.run(`
    INSERT INTO sessions (token, user_id, ip_address, user_agent, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `, [token, user.id, req?.ip || null, req?.get?.('user-agent') || null, expiryDate().toISOString()]);
  return token;
}

async function getSessionUser(token) {
  if (!token) return null;

  const row = await db.getOne(`
    SELECT s.token, s.expires_at, u.id, u.email, u.first_name, u.last_name, u.role, u.staff_id, u.is_active,
           st.specialty
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    LEFT JOIN staff st ON u.staff_id = st.id
    WHERE s.token = ?
  `, [token]);

  if (!row || !row.is_active) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await destroySession(token);
    return null;
  }

  return {
    id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    role: row.role,
    staff_id: row.staff_id,
    specialty: row.specialty || null,
  };
}

async function destroySession(token) {
  if (!token) return;
  await db.run('DELETE FROM sessions WHERE token = ?', [token]);
}

async function cleanupExpiredSessions() {
  await db.run('DELETE FROM sessions WHERE expires_at < ?', [new Date().toISOString()]);
}

module.exports = { createSession, getSessionUser, destroySession, cleanupExpiredSessions, SESSION_TTL_HOURS };
