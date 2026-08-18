/* Doctor panel: calendar, slots, patient card */

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

const statusMap = {
  pending: 'Ожидает', confirmed: 'Подтверждена', cancelled: 'Отменена', completed: 'Завершена',
};

const recordTypeMap = {
  note: 'Заметка', procedure: 'Процедура', result: 'Результат', diagnosis: 'Диагноз',
};

let calendarStart = startOfWeek(new Date());
let selectedCalendarDate = null;
let currentPatientAppointmentId = null;

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatDateISO(d) {
  return d.toISOString().split('T')[0];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Ошибка');
  return data;
}

function initDoctorPanel(user) {
  if (!user?.staff_id) return;

  document.getElementById('generateSlotsForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const date = document.getElementById('genDate').value;
    if (!date) return;

    const result = await fetchJSON('/api/slots/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: user.staff_id,
        date,
        start_time: document.getElementById('genStart').value,
        end_time: document.getElementById('genEnd').value,
        interval_min: parseInt(document.getElementById('genInterval').value, 10) || 30,
      }),
    });

    alert(`Создано окон: ${result.created} из ${result.total}`);
    if (selectedCalendarDate === date) loadDaySlots(user.staff_id, date);
    loadCalendar(user.staff_id);
  });

  document.getElementById('calPrev')?.addEventListener('click', () => {
    calendarStart = addDays(calendarStart, -7);
    loadCalendar(user.staff_id);
  });

  document.getElementById('calNext')?.addEventListener('click', () => {
    calendarStart = addDays(calendarStart, 7);
    loadCalendar(user.staff_id);
  });

  document.getElementById('closePatientModal')?.addEventListener('click', closePatientModal);
  document.getElementById('patientModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'patientModal') closePatientModal();
  });

  const today = formatDateISO(new Date());
  document.getElementById('genDate').value = today;
  selectedCalendarDate = today;
  loadCalendar(user.staff_id);
  loadDaySlots(user.staff_id, today);
  loadDoctorAppointmentsList(user.staff_id);
}

async function loadCalendar(staffId) {
  const grid = document.getElementById('calendarGrid');
  const label = document.getElementById('calendarLabel');
  if (!grid) return;

  const from = formatDateISO(calendarStart);
  const to = formatDateISO(addDays(calendarStart, 6));

  const endDate = addDays(calendarStart, 6);
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
  loadCalendar(staffId);
  loadDaySlots(staffId, date);
};

async function loadDaySlots(staffId, date) {
  const container = document.getElementById('daySlots');
  const title = document.getElementById('daySlotsTitle');
  if (!container) return;

  const d = new Date(date + 'T00:00:00');
  title.textContent = `Окна приёма — ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

  const slots = await fetchJSON(`/api/slots?staff_id=${staffId}&date=${date}`);

  if (!slots.length) {
    container.innerHTML = '<p style="color:var(--text-muted);font-size:13px;">Нет окон на этот день. Создайте расписание ниже.</p>';
    return;
  }

  container.innerHTML = slots.map(s => {
    if (s.status === 'booked') {
      return `
        <div class="day-slot day-slot--booked" onclick="openPatientCard(${s.appointment_id}, ${staffId})">
          ${s.slot_time.slice(0, 5)}<br>
          <span style="font-size:11px;font-weight:400;">${s.patient_name || 'Занято'}</span>
        </div>
      `;
    }
    return `
      <div class="day-slot day-slot--free" onclick="deleteSlot(${s.id}, ${staffId}, '${date}')">
        ${s.slot_time.slice(0, 5)}<br>
        <span style="font-size:11px;font-weight:400;">свободно</span>
      </div>
    `;
  }).join('');
}

window.deleteSlot = async (slotId, staffId, date) => {
  if (!confirm('Удалить это свободное окно?')) return;
  await fetchJSON(`/api/slots/${slotId}`, { method: 'DELETE' });
  loadDaySlots(staffId, date);
  loadCalendar(staffId);
};

window.openPatientCard = async (appointmentId, staffId) => {
  currentPatientAppointmentId = appointmentId;
  const modal = document.getElementById('patientModal');
  const body = document.getElementById('patientModalBody');

  const { appointment, records, files } = await fetchJSON(`/api/appointments/${appointmentId}`);
  const effectiveStaffId = staffId || appointment.staff_id;
  const history = await fetchJSON(`/api/patients/history?phone=${encodeURIComponent(appointment.patient_phone_normalized || appointment.patient_phone)}`);

  body.innerHTML = `
    <div class="patient-info">
      <div class="patient-info__row"><span class="patient-info__label">Пациент</span><strong>${appointment.patient_name}</strong></div>
      <div class="patient-info__row"><span class="patient-info__label">Телефон</span>${appointment.patient_phone}</div>
      <div class="patient-info__row"><span class="patient-info__label">Дата</span>${appointment.appointment_date} в ${appointment.appointment_time.slice(0, 5)}</div>
      <div class="patient-info__row"><span class="patient-info__label">Услуга</span>${appointment.service_name || '—'}</div>
      <div class="patient-info__row"><span class="patient-info__label">Комментарий</span>${appointment.comment || '—'}</div>
      <div class="patient-info__row"><span class="patient-info__label">Статус</span>${statusMap[appointment.status] || appointment.status}</div>
    </div>

    <div class="section-block">
      <div class="section-block__title">История визитов (${history.length})</div>
      <ul class="history-list">
        ${history.map(h => `
          <li class="history-item ${h.id === appointmentId ? 'current' : ''}"
              onclick="openPatientCard(${h.id}, ${effectiveStaffId})">
            <strong>${h.appointment_date}</strong> ${h.appointment_time.slice(0, 5)}
            — ${h.service_name || 'Приём'} (${statusMap[h.status]})
            ${h.id === appointmentId ? ' · текущий' : ''}
          </li>
        `).join('')}
      </ul>
    </div>

    <div class="section-block">
      <div class="section-block__title">Медицинские записи</div>
      <ul class="records-list">
        ${records.length ? records.map(r => `
          <li class="record-item">
            <div class="record-item__type">${recordTypeMap[r.record_type] || r.record_type} · ${new Date(r.created_at).toLocaleDateString('ru-RU')}</div>
            ${r.title ? `<strong>${r.title}</strong><br>` : ''}
            ${r.content}
          </li>
        `).join('') : '<li style="color:var(--text-muted);font-size:13px;">Записей пока нет</li>'}
      </ul>
      <form id="addRecordForm" style="margin-top:12px;">
        <div class="form-row">
          <div class="form-group">
            <label>Тип</label>
            <select id="recordType">
              <option value="note">Заметка</option>
              <option value="procedure">Процедура</option>
              <option value="result">Результат</option>
              <option value="diagnosis">Диагноз</option>
            </select>
          </div>
          <div class="form-group">
            <label>Заголовок</label>
            <input type="text" id="recordTitle" placeholder="Необязательно">
          </div>
        </div>
        <div class="form-group">
          <label>Текст *</label>
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
            📎 <a href="/api/files/${f.id}/download" target="_blank">${f.original_name}</a>
            ${f.description ? `<br><span style="color:var(--text-muted);">${f.description}</span>` : ''}
            <span style="color:var(--text-light);font-size:11px;"> · ${new Date(f.created_at).toLocaleDateString('ru-RU')}</span>
          </li>
        `).join('') : '<li style="color:var(--text-muted);font-size:13px;">Файлов пока нет</li>'}
      </ul>
      <form id="addFileForm" style="margin-top:12px;" enctype="multipart/form-data">
        <div class="form-group">
          <label>Файл (до 10 МБ)</label>
          <input type="file" id="recordFile" required>
        </div>
        <div class="form-group">
          <label>Описание</label>
          <input type="text" id="fileDescription" placeholder="Результаты анализа, снимок...">
        </div>
        <button type="submit" class="btn btn--outline btn--sm">Загрузить файл</button>
      </form>
    </div>
  `;

  document.getElementById('addRecordForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await fetchJSON(`/api/appointments/${appointmentId}/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        staff_id: effectiveStaffId,
        record_type: document.getElementById('recordType').value,
        title: document.getElementById('recordTitle').value,
        content: document.getElementById('recordContent').value,
      }),
    });
    openPatientCard(appointmentId, staffId);
  });

  document.getElementById('addFileForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fileInput = document.getElementById('recordFile');
    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('staff_id', effectiveStaffId);
    formData.append('description', document.getElementById('fileDescription').value);

    const res = await fetch(`/api/appointments/${appointmentId}/files`, { method: 'POST', body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    openPatientCard(appointmentId, staffId);
  });

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
};

function closePatientModal() {
  document.getElementById('patientModal')?.classList.remove('active');
  document.body.style.overflow = '';
}

async function loadDoctorAppointmentsList(staffId) {
  const tbody = document.getElementById('doctorAppointmentsTable');
  if (!tbody) return;

  const appts = await fetchJSON(`/api/appointments?staff_id=${staffId}`);

  tbody.innerHTML = appts.length ? appts.map(a => `
    <tr class="clickable-row" onclick="openPatientCard(${a.id}, ${staffId})">
      <td>${a.appointment_date}</td>
      <td>${a.appointment_time.slice(0, 5)}</td>
      <td>${a.patient_name}</td>
      <td>${a.patient_phone}</td>
      <td>${a.service_name || '—'}</td>
      <td><span class="badge badge--blue">${statusMap[a.status] || a.status}</span></td>
    </tr>
  `).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);">Записей пока нет</td></tr>';
}

window.initDoctorPanel = initDoctorPanel;
window.loadDoctorAppointmentsList = loadDoctorAppointmentsList;
window.openPatientCard = openPatientCard;
