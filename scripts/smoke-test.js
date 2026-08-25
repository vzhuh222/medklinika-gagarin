/**
 * Проверка основных сценариев на локальном сервере.
 * Запуск: node scripts/smoke-test.js (сервер должен быть запущен)
 */

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';

let passed = 0;
let failed = 0;

function check(name, condition, details = '') {
  if (condition) {
    passed++;
    console.log(`  ok   ${name}`);
  } else {
    failed++;
    console.log(`  FAIL ${name}${details ? ` — ${details}` : ''}`);
  }
}

async function call(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function main() {
  console.log(`\nПроверка ${BASE}\n`);

  console.log('Публичные данные');
  const clinic = await call('/api/clinic');
  check('GET /api/clinic отвечает', clinic.status === 200);
  check('адрес — Киржач', /Киржач/.test(clinic.body?.address || ''), clinic.body?.address);
  check('координаты заданы', Boolean(clinic.body?.latitude && clinic.body?.longitude));

  const services = await call('/api/services');
  check('GET /api/services отвечает', services.status === 200);
  check('услуги загружены', Array.isArray(services.body) && services.body.length > 0);

  const staff = await call('/api/staff');
  check('GET /api/staff отвечает', staff.status === 200);
  check('список врачей получен', Array.isArray(staff.body));
  check('телефоны сотрудников скрыты от гостей',
    !staff.body?.some((s) => 'phone' in s || 'email' in s));

  console.log('\nЗакрытые данные без токена');
  check('GET /api/appointments → 401', (await call('/api/appointments')).status === 401);
  check('GET /api/auth/accounts → 401', (await call('/api/auth/accounts')).status === 401);
  check('POST /api/auth/accounts → 401',
    (await call('/api/auth/accounts', { method: 'POST', body: '{}' })).status === 401);
  check('POST /api/staff → 401',
    (await call('/api/staff', { method: 'POST', body: '{}' })).status === 401);
  check('GET /api/patients/history → 401',
    (await call('/api/patients/history?phone=79999999999')).status === 401);
  check('GET /api/integrations/status → 401',
    (await call('/api/integrations/status')).status === 401);
  check('GET /api/files/1/download → 401',
    (await call('/api/files/1/download')).status === 401);

  console.log('\nАвторизация');
  const badLogin = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@medklinika.ru', password: 'wrong' }),
  });
  check('неверный пароль → 401', badLogin.status === 401);

  const login = await call('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@medklinika.ru', password: 'admin123' }),
  });
  check('вход администратора', login.status === 200, JSON.stringify(login.body));
  check('выдан токен', Boolean(login.body?.token));
  const adminToken = login.body?.token;

  check('битый токен → 401', (await call('/api/appointments', { token: 'deadbeef' })).status === 401);
  check('GET /api/appointments с токеном', (await call('/api/appointments', { token: adminToken })).status === 200);
  check('GET /api/auth/me с токеном', (await call('/api/auth/me', { token: adminToken })).status === 200);

  console.log('\nПроверка валидации без создания данных');
  const invalidDoctor = await call('/api/staff', {
    method: 'POST',
    token: adminToken,
    body: JSON.stringify({ first_name: 'Тест', last_name: 'Тест', specialty: 'Терапевт' }),
  });
  check('врач без логина и пароля не создаётся', invalidDoctor.status === 400);

  const invalidBooking = await call('/api/appointments', {
    method: 'POST',
    body: JSON.stringify({
      patient_name: 'Проверка Валидации',
      patient_phone: '+7 12',
      consent_accepted: false,
    }),
  });
  check('некорректная запись отклонена без сохранения', invalidBooking.status === 400);

  check('создание расписания без авторизации запрещено',
    (await call('/api/slots/generate', { method: 'POST', body: '{}' })).status === 401);

  console.log('\nПрочее');
  check('GET /health', (await call('/health')).status === 200);
  check('несуществующий метод API → 404 JSON', (await call('/api/nope')).status === 404);
  check('выход из системы', (await call('/api/auth/logout', { method: 'POST', token: adminToken })).status === 200);
  check('токен после выхода недействителен',
    (await call('/api/appointments', { token: adminToken })).status === 401);

  console.log(`\nИтог: ${passed} успешно, ${failed} с ошибками\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Проверка прервана:', err);
  process.exit(1);
});
