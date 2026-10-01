const db = require('./db');

const CLINIC_DESCRIPTION =
  'Многопрофильная клиника в Киржаче (ранее — «Инвитро»). Приём ведут кардиолог, хирург, гинеколог и терапевт. УЗИ-диагностика и лабораторные анализы от ИНВИТРО.';

/** Снимает с сайта сотрудников, которые больше не работают. Идемпотентно. */
async function applyStaffRosterUpdates() {
  await db.run(`
    UPDATE staff
    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE last_name = 'Токарев' AND first_name = 'Александр'
  `);
  await db.run(`
    UPDATE users
    SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
    WHERE email = 'a.tokarev@medklinika.ru'
  `);
  await db.run(`
    UPDATE services
    SET is_active = FALSE
    WHERE name = 'Приём уролога'
  `);
  await db.run(`
    UPDATE clinic_info
    SET description = ?
    WHERE id = 1 AND description LIKE '%уролог%'
  `, [CLINIC_DESCRIPTION]);
}

module.exports = { applyStaffRosterUpdates };
