/* Кабинет врача: календарь, окна приёма, карточка пациента */

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const recordTypeMap = {
  note: 'Заметка', procedure: 'Процедура', result: 'Результат', diagnosis: 'Диагноз',
};

let calendarStart = startOfWeek(new Date());
let selectedCalendarDate = null;

function notify(message, type = 'error') {
  if (typeof showToast === 'function') showToast(message, type);
  else console.error(message);
}

function run(action) {
  return Promise.resolve()
    .then(action)
    .catch((err) => notify(err.message));
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** toISOString() сдвигает дату в UTC — собираем ISO-строку по локальному времени. */
function formatDateISO(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function initDoctorPanel(user) {
  if (!user?.staff_id) {
    notify('Учётная запись не привязана к врачу — обратитесь к администратору');
    return;
  }

  document.getElementById('generateSlotsForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      const date = document.getElementById('genDate').value;
      if (!date) return;

      const result = await fetchJSON('/api/slots/generate', {
        method: 'POST',
        body: JSON.stringify({
          staff_id: user.staff_id,
          date,
          start_time: document.getElementById('genStart').value,
          end_time: document.getElementById('genEnd').value,
          interval_min: parseInt(document.getElementById('genInterval').value, 10) || 30,
        }),
      });

      const skipped = result.total - result.created;
      notify(
        `Создано окон: ${result.created}${skipped > 0 ? ` (${skipped} уже существовали)` : ''}`,
        'success',
      );
      if (selectedCalendarDate === date) loadDaySlots(user.staff_id, date);
      loadCalendar(user.staff_id);
    });
  });

  document.getElementById('calPrev')?.addEventListener('click', () => {
    calendarStart = addDays(calendarStart, -7);
    run(() => loadCalendar(user.staff_id));
  });

  document.getElementById('calNext')?.addEventListener('click', () => {
    calendarStart = addDays(calendarStart, 7);
    run(() => loadCalendar(user.staff_id));
  });

  const today = formatDateISO(new Date());
  document.getElementById('genDate').value = today;
  document.getElementById('genDate').min = today;
  selectedCalendarDate = today;

  run(() => loadCalendar(user.staff_id));
  run(() => loadDaySlots(user.staff_id, today));
  run(() => loadDoctorAppointmentsList(user.staff_id));
}

async function loadCalendar(staffId) {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarLabel');
  if (!grid) return;

  const from = formatDateISO(calendarStart);
  const endDate = addDays(calendarStart, 6);
  const to = formatDateISO(endDate);

  label.textContent = `${calendarStart.getDate()} ${MONTHS[calendarStart.getMonth()]} — ${endDate.getDate()} ${MONTHS[endDate.getMonth()]} ${endDate.getFullYear()}`;

  const slots = await fetchJSON(`/api/slots?staff_id=${staffId}&from=${from}&to=${to}`);
  const byDate = {};
  for (const s of slots) {
    if (!byDate[s.slot_date]) byDate[s.slot_date] = { free: 0, booked: 0 };
    if (s.status === 'available') byDate[s.slot_date].free++;
    else byDate[s.slot_date].booked++;
  }

  const today = formatDateISO(new Date());
  grid.innerHTML = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(calendarStart, i);
    const iso = formatDateISO(d);
    const stats = byDate[iso] || { free: 0, booked: 0 };
    const isSelected = iso === selectedCalendarDate;
    const isToday = iso === today;

    return `
      <div class="calendar-day ${isSelected ? 'selected' : ''} ${isToday ? 'calendar-day--today' : ''}"
           data-date="${iso}" onclick="selectCalendarDay('${iso}', ${staffId})">
        <div class="calendar-day__weekday">${WEEKDAYS[d.getDay()]}</div>
        <div class="calendar-day__date">${d.getDate()}</div>
        <div class="calendar-day__stats">
          ${stats.free ? `🟢 ${stats.free}` : ''}
          ${stats.booked ? ` 🟡 ${stats.booked}` : ''}
          ${!stats.free && !stats.booked ? '—' : ''}
        </div>
      </div>
    `;
  }).join('');
}

window.selectCalendarDay = (date, staffId) => {
  selectedCalendarDate = date;
  document.getElementById('genDate').value = date;
  run(() => loadCalendar(staffId));
  run(() => loadDaySlots(staffId, date));
};

async function loadDaySlots(staffId, date) {
  const container = document.getElementById('daySlots');
  const title = document.getElementById('daySlotsTitle');
  if (!container) return;

  const d = new Date(date + 'T00:00:00');
  title.textContent = `Окна приёма — ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

  const slots = await fetchJSON(`/api/slots?staff_id=${staffId}&date=${date}`);

  if (!slots.length) {
    container.innerHTML = '<p class="hint-text">Нет окон на этот день. Создайте расписание ниже.</p>';
    return;
  }

  container.innerHTML = slots.map(s => {
    if (s.status === 'booked') {
      return `
        <div class="day-slot day-slot--booked" onclick="openPatientCard(${s.appointment_id}, ${staffId})"
             title="Открыть карточку пациента">
          ${escapeHtml(String(s.slot_time).slice(0, 5))}<br>
          <span class="day-slot__label">${escapeHtml(s.patient_name) || 'Занято'}</span>
        </div>
      `;
    }
    return `
      <div class="day-slot day-slot--free" onclick="deleteSlot(${s.id}, ${staffId}, '${date}')"
           title="Удалить свободное окно">
        ${escapeHtml(String(s.slot_time).slice(0, 5))}<br>
        <span class="day-slot__label">свободно</span>
      </div>
    `;
  }).join('');
}

window.deleteSlot = (slotId, staffId, date) => run(async () => {
  if (!confirm('Удалить это свободное окно?')) return;
  await fetchJSON(`/api/slots/${slotId}`, { method: 'DELETE' });
  await loadDaySlots(staffId, date);
  await loadCalendar(staffId);
});

window.downloadPatientFile = (fileId, name) => run(() =>
  apiClient.downloadFile(`/api/files/${fileId}/download`, name));

window.openPatientCard = (appointmentId, staffId) => run(async () => {
  const modal = document.getElementById('patientModal');
  const body = document.getElementById('patientModalBody');

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<p class="hint-text">Загрузка карточки…</p>';

  const { appointment, records, files } = await fetchJSON(`/api/appointments/${appointmentId}`);
  const effectiveStaffId = staffId || appointment.staff_id;

  let history = [];
  try {
    const phone = appointment.patient_phone_normalized || appointment.patient_phone;
    history = await fetchJSON(`/api/patients/history?phone=${encodeURIComponent(phone)}`);
  } catch {
    history = [];
  }

  body.innerHTML = `
    <div class="patient-info">
      <div class="patient-info__row"><span class="patient-info__label">Пациент</span><strong>${escapeHtml(appointment.patient_name)}</strong></div>
      <div class="patient-info__row"><span class="patient-info__label">Телефон</span><a href="tel:${escapeHtml(appointment.patient_phone_normalized || appointment.patient_phone)}">${escapeHtml(appointment.patient_phone)}</a></div>
      <div class="patient-info__row"><span class="patient-info__label">Дата</span>${escapeHtml(appointment.appointment_date)} в ${escapeHtml(String(appointment.appointment_time).slice(0, 5))}</div>
      <div class="patient-info__row"><span class="patient-info__label">Услуга</span>${escapeHtml(appointment.service_name) || '—'}</div>
      <div class="patient-info__row"><span class="patient-info__label">Комментарий</span>${escapeHtml(appointment.comment) || '—'}</div>
      <div class="patient-info__row"><span class="patient-info__label">Статус</span>${STATUS_LABELS[appointment.status] || escapeHtml(appointment.status)}</div>
    </div>

    <div class="section-block">
      <div class="section-block__title">Статус приёма</div>
      <div class="status-actions">
        ${['confirmed', 'completed', 'cancelled'].map(s => `
          <button type="button" class="btn btn--outline btn--sm ${appointment.status === s ? 'btn--active' : ''}"
                  onclick="changeAppointmentStatus(${appointment.id}, '${s}', ${effectiveStaffId})">
            ${STATUS_LABELS[s]}
          </button>
        `).join('')}
      </div>
    </div>

    <div class="section-block">
      <div class="section-block__title">История визитов (${history.length})</div>
      <ul class="history-list">
        ${history.length ? history.map(h => `
          <li class="history-item ${h.id === appointmentId ? 'current' : ''}"
              onclick="openPatientCard(${h.id}, ${effectiveStaffId})">
            <strong>${escapeHtml(h.appointment_date)}</strong> ${escapeHtml(String(h.appointment_time).slice(0, 5))}
            — ${escapeHtml(h.service_name) || 'Приём'} (${STATUS_LABELS[h.status] || escapeHtml(h.status)})
            ${h.id === appointmentId ? ' · текущий' : ''}
          </li>
        `).join('') : '<li class="hint-text">История недоступна</li>'}
      </ul>
    </div>

    <div class="section-block">
      <div class="section-block__title">Медицинские записи</div>
      <ul class="records-list">
        ${records.length ? records.map(r => `
          <li class="record-item">
            <div class="record-item__type">${recordTypeMap[r.record_type] || escapeHtml(r.record_type)} · ${new Date(r.created_at).toLocaleDateString('ru-RU')}</div>
            ${r.title ? `<strong>${escapeHtml(r.title)}</strong><br>` : ''}
            ${escapeHtml(r.content)}
          </li>
        `).join('') : '<li class="hint-text">Записей пока нет</li>'}
      </ul>
      <form id="addRecordForm" style="margin-top:12px;">
        <div class="form-row">
          <div class="form-group">
            <label for="recordType">Тип</label>
            <select id="recordType">
              <option value="note">Заметка</option>
              <option value="procedure">Процедура</option>
              <option value="result">Результат</option>
              <option value="diagnosis">Диагноз</option>
            </select>
          </div>
          <div class="form-group">
            <label for="recordTitle">Заголовок</label>
            <input type="text" id="recordTitle" placeholder="Необязательно">
          </div>
        </div>
        <div class="form-group">
          <label for="recordContent">Текст *</label>
          <textarea id="recordContent" required placeholder="Описание приёма, процедуры, результаты..."></textarea>
        </div>
        <button type="submit" class="btn btn--primary btn--sm">Добавить запись</button>
      </form>
    </div>

    <div class="section-block">
      <div class="section-block__title">Файлы</div>
      <ul class="files-list">
        ${files.length ? files.map(f => `
          <li class="file-item">
            📎 <a href="#" onclick="event.preventDefault();downloadPatientFile(${f.id}, '${escapeHtml(f.original_name).replace(/'/g, '')}')">${escapeHtml(f.original_name)}</a>
            ${f.description ? `<br><span class="hint-text">${escapeHtml(f.description)}</span>` : ''}
            <span class="file-item__date"> · ${new Date(f.created_at).toLocaleDateString('ru-RU')}</span>
          </li>
        `).join('') : '<li class="hint-text">Файлов пока нет</li>'}
      </ul>
      <form id="addFileForm" style="margin-top:12px;">
        <div class="form-group">
          <label for="recordFile">Файл (изображение, PDF или документ, до 10 МБ)</label>
          <input type="file" id="recordFile" required accept="image/*,.pdf,.doc,.docx,.txt">
        </div>
        <div class="form-group">
          <label for="fileDescription">Описание</label>
          <input type="text" id="fileDescription" placeholder="Результаты анализа, снимок...">
        </div>
        <button type="submit" class="btn btn--outline btn--sm">Загрузить файл</button>
      </form>
    </div>
  `;

  document.getElementById('addRecordForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      await fetchJSON(`/api/appointments/${appointmentId}/records`, {
        method: 'POST',
        body: JSON.stringify({
          record_type: document.getElementById('recordType').value,
          title: document.getElementById('recordTitle').value.trim(),
          content: document.getElementById('recordContent').value.trim(),
        }),
      });
      notify('Запись добавлена', 'success');
      openPatientCard(appointmentId, staffId);
    });
  });

  document.getElementById('addFileForm')?.addEventListener('submit', (e) => {
    e.preventDefault();
    run(async () => {
      const fileInput = document.getElementById('recordFile');
      if (!fileInput.files[0]) throw new Error('Выберите файл');

      const formData = new FormData();
      formData.append('file', fileInput.files[0]);
      formData.append('description', document.getElementById('fileDescription').value.trim());

      await fetchJSON(`/api/appointments/${appointmentId}/files`, { method: 'POST', body: formData });
      notify('Файл загружен', 'success');
      openPatientCard(appointmentId, staffId);
    });
  });
});

window.changeAppointmentStatus = (appointmentId, status, staffId) => run(async () => {
  await fetchJSON(`/api/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
  notify('Статус обновлён', 'success');
  openPatientCard(appointmentId, staffId);
  if (typeof loadAppointments === 'function') loadAppointments();
  if (staffId) {
    loadDoctorAppointmentsList(staffId).catch(() => {});
    if (selectedCalendarDate) loadDaySlots(staffId, selectedCalendarDate).catch(() => {});
  }
});

function closePatientModal() {
  document.getElementById('patientModal')?.classList.remove('active');
  document.body.style.overflow = '';
}

/** Карточка пациента доступна и врачу, и администратору, поэтому обработчики общие. */
function initPatientModal() {
  const modal = document.getElementById('patientModal');
  if (!modal) return;

  document.getElementById('closePatientModal')?.addEventListener('click', closePatientModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closePatientModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal.classList.contains('active')) closePatientModal();
  });

  // Делегирование вместо inline-обработчиков: клик по любой ячейке строки открывает карточку.
  document.addEventListener('click', (e) => {
    const row = e.target.closest('tr.clickable-row[data-appointment-id]');
    if (!row || e.target.closest('[data-no-card]')) return;
    openPatientCard(Number(row.dataset.appointmentId), Number(row.dataset.staffId) || 0);
  });
}

async function loadDoctorAppointmentsList(staffId) {
  const tbody = document.getElementById('doctorAppointmentsTable');
  if (!tbody) return;

  const appts = await fetchJSON(`/api/appointments?staff_id=${staffId}`);

  tbody.innerHTML = appts.length ? appts.map(a => `
    <tr class="clickable-row" data-appointment-id="${a.id}" data-staff-id="${staffId}">
      <td>${escapeHtml(a.appointment_date)}</td>
      <td>${escapeHtml(String(a.appointment_time).slice(0, 5))}</td>
      <td>${escapeHtml(a.patient_name)}</td>
      <td>${escapeHtml(a.patient_phone)}</td>
      <td>${escapeHtml(a.service_name) || '—'}</td>
      <td><span class="badge badge--blue">${STATUS_LABELS[a.status] || escapeHtml(a.status)}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="6" class="table-empty">Записей пока нет</td></tr>';
}

window.initDoctorPanel = initDoctorPanel;
window.initPatientModal = initPatientModal;
window.loadDoctorAppointmentsList = loadDoctorAppointmentsList;
