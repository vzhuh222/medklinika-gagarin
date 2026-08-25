/* Общий клиент API для панелей сотрудников: токен, обработка ошибок, выход по истечении сессии. */

const AUTH_TOKEN_KEY = 'authToken';
const AUTH_USER_KEY = 'user';

/* Общие словари статусов — объявлены один раз, чтобы скрипты не переопределяли друг друга. */
const STATUS_LABELS = {
  pending: 'Ожидает', confirmed: 'Подтверждена', cancelled: 'Отменена', completed: 'Завершена',
};

const SYNC_LABELS = {
  local: 'Локально', pending: '…', synced: '✓', failed: '✗',
};

function getToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getCurrentUser() {
  try {
    return JSON.parse(localStorage.getItem(AUTH_USER_KEY) || 'null');
  } catch {
    return null;
  }
}

function saveSession(token, user) {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

function redirectToLogin(reason) {
  clearSession();
  const suffix = reason ? `?reason=${encodeURIComponent(reason)}` : '';
  window.location.href = `/login.html${suffix}`;
}

function authHeaders(extra = {}) {
  const token = getToken();
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function apiFetch(url, options = {}) {
  const headers = authHeaders(options.headers || {});
  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    redirectToLogin('expired');
    throw new Error('Сессия истекла, войдите заново');
  }

  return res;
}

async function fetchJSON(url, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...(options.headers || {}) };
  if (options.body && !isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await apiFetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
  return data;
}

async function downloadFile(url, filename) {
  const res = await apiFetch(url);
  if (!res.ok) throw new Error('Не удалось скачать файл');

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename || 'file';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch {
    /* сессия могла истечь — всё равно выходим */
  }
  clearSession();
  window.location.href = '/login.html';
}

/** Экранирование пользовательских данных перед вставкой в HTML. */
function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

window.apiClient = {
  getToken, getCurrentUser, saveSession, clearSession,
  apiFetch, fetchJSON, downloadFile, logout, redirectToLogin, escapeHtml,
};

window.fetchJSON = fetchJSON;
window.escapeHtml = escapeHtml;
window.STATUS_LABELS = STATUS_LABELS;
window.SYNC_LABELS = SYNC_LABELS;
