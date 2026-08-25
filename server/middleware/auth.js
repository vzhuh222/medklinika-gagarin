const { getSessionUser } = require('../services/sessions');

function extractToken(req) {
  const header = req.get('authorization') || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  return req.get('x-auth-token') || null;
}

async function attachUser(req, _res, next) {
  try {
    req.user = await getSessionUser(extractToken(req));
  } catch {
    req.user = null;
  }
  next();
}

function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Требуется вход в систему' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Требуется вход в систему' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Доступ только для администратора' });
  }
  next();
}

/**
 * Врач работает только со своими пациентами, администратор — со всеми.
 * Возвращает null, если ограничение не нужно.
 */
function staffScope(user) {
  if (!user || user.role === 'admin') return null;
  return user.staff_id ?? -1;
}

module.exports = { attachUser, requireAuth, requireAdmin, staffScope };
