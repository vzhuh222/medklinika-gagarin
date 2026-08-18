const API = '/api';

const SPECIALTY_ICONS = {
  'Терапевт': '👨‍⚕️',
  'Кардиолог': '❤️',
  'Невролог': '🧠',
  'Гинеколог': '👩‍⚕️',
  'Хирург': '🔬',
  'Медсестра': '💉',
};

function formatPrice(price) {
  if (!price) return '';
  return `от ${price.toLocaleString('ru-RU')} ₽`;
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Ошибка запроса');
  return data;
}

function initPhoneMask() {
  const input = document.getElementById('apPhone');
  if (!input) return;

  const format = (raw) => {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('8')) digits = '7' + digits.slice(1);
    if (!digits.startsWith('7')) digits = '7' + digits.replace(/^7*/, '');
    digits = digits.slice(0, 11);

    if (digits.length <= 1) return '+7 ';

    let out = '+7 ';
    const d = digits.slice(1);
    if (d.length > 0) out += '(' + d.slice(0, 3);
    if (d.length >= 3) out += ') ';
    if (d.length > 3) out += d.slice(3, 6);
    if (d.length >= 6) out += '-';
    if (d.length > 6) out += d.slice(6, 8);
    if (d.length >= 8) out += '-';
    if (d.length > 8) out += d.slice(8, 10);
    return out;
  };

  input.addEventListener('input', () => {
    const pos = input.selectionStart;
    input.value = format(input.value);
    input.setSelectionRange(input.value.length, input.value.length);
  });

  input.addEventListener('focus', () => {
    if (!input.value.trim()) input.value = '+7 ';
  });

  input.addEventListener('keydown', (e) => {
    if ((e.key === 'Backspace' || e.key === 'Delete') && input.value.length <= 3) {
      e.preventDefault();
      input.value = '+7 ';
    }
  });
}

async function loadClinicInfo() {
  try {
    const clinic = await fetchJSON(`${API}/clinic`);
    if (!clinic) return;

    const set = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    set('clinicName', clinic.name);
    set('clinicDesc', clinic.description);
    set('clinicAddress', clinic.address);
    set('clinicHours', clinic.work_hours);
    set('clinicPhone', clinic.phone);
    set('aboutText', clinic.description);
    set('contactsAddress', clinic.address);
    set('footerPhone', clinic.phone);
    set('footerEmail', clinic.email);
    set('footerHours', clinic.work_hours);

    const headerPhone = document.getElementById('headerPhone');
    if (headerPhone) {
      headerPhone.textContent = clinic.phone;
      headerPhone.href = `tel:${clinic.phone.replace(/\D/g, '')}`;
    }
  } catch (e) {
    console.error('Clinic info error:', e);
  }
}

let paymentsEnabled = false;

async function loadPublicConfig() {
  try {
    const cfg = await fetchJSON(`${API}/config/public`);
    paymentsEnabled = cfg.paymentsEnabled;
    if (cfg.yandexMapsApiKey) initYandexMap(cfg.yandexMapsApiKey);
    else showMapFallback();
  } catch {
    showMapFallback();
  }
}

function showMapFallback() {
  const el = document.getElementById('yandexMap');
  if (!el) return;
  el.innerHTML = `
    <div class="map-placeholder" style="height:100%;border:none;">
      <div class="map-placeholder__icon">🗺️</div>
      <p id="mapFallbackAddress">МедКлиника на Гагарина</p>
      <a href="https://yandex.ru/maps/" target="_blank" rel="noopener" class="btn btn--outline btn--sm">Открыть на карте</a>
    </div>`;
}

function initYandexMap(apiKey) {
  const el = document.getElementById('yandexMap');
  if (!el || !apiKey) return showMapFallback();

  const script = document.createElement('script');
  script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
  script.onload = () => {
    ymaps.ready(() => {
      fetchJSON(`${API}/clinic`).then(clinic => {
        const lat = clinic?.latitude || 55.7558;
        const lon = clinic?.longitude || 37.6173;
        const map = new ymaps.Map('yandexMap', { center: [lat, lon], zoom: 16, controls: ['zoomControl', 'routeButtonControl'] });
        map.geoObjects.add(new ymaps.Placemark([lat, lon], {
          balloonContent: `<strong>${clinic?.name || ''}</strong><br>${clinic?.address || ''}<br>${clinic?.phone || ''}`,
        }, { preset: 'islands#medicalIcon' }));
      }).catch(showMapFallback);
    });
  };
  script.onerror = showMapFallback;
  document.head.appendChild(script);
}

async function loadServices() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;

  try {
    const services = await fetchJSON(`${API}/services`);
    grid.innerHTML = services.map(s => `
      <div class="service-card">
        <div class="service-card__category">${s.category}</div>
        <div class="service-card__name">${s.name}</div>
        <div class="service-card__desc">${s.description || ''}</div>
        <div class="service-card__footer">
          <span class="service-card__price">${formatPrice(s.price_from)}</span>
          ${s.duration_min ? `<span class="service-card__duration">${s.duration_min} мин</span>` : ''}
        </div>
      </div>
    `).join('');

    const apService = document.getElementById('apService');
    if (apService) {
      apService.innerHTML = '<option value="">Выберите услугу</option>' +
        services.map(s => `<option value="${s.id}" data-price="${s.price_from || 0}">${s.name}${s.price_from ? ` — от ${s.price_from} ₽` : ''}</option>`).join('');
      apService.addEventListener('change', () => {
        const opt = apService.selectedOptions[0];
        const hasPrice = opt && parseFloat(opt.dataset.price) > 0;
        document.getElementById('payOnlineGroup').style.display = paymentsEnabled && hasPrice ? 'block' : 'none';
      });
    }
  } catch (e) {
    grid.innerHTML = '<p style="color:red;text-align:center;grid-column:1/-1;">Не удалось загрузить услуги</p>';
  }
}

async function loadDoctors() {
  const grid = document.getElementById('doctorsGrid');
  if (!grid) return;

  try {
    const staff = await fetchJSON(`${API}/staff`);
    grid.innerHTML = staff.map(d => `
      <div class="doctor-card">
        <div class="doctor-card__photo">${SPECIALTY_ICONS[d.specialty] || '👨‍⚕️'}</div>
        <div class="doctor-card__body">
          <div class="doctor-card__name">${d.last_name} ${d.first_name} ${d.middle_name || ''}</div>
          <div class="doctor-card__specialty">${d.specialty}</div>
          ${d.qualification ? `<div class="doctor-card__qual">${d.qualification}</div>` : ''}
          ${d.experience_years ? `<div class="doctor-card__exp">Стаж: ${d.experience_years} лет</div>` : ''}
          ${d.schedule ? `<div class="doctor-card__schedule">📅 ${d.schedule}</div>` : ''}
        </div>
      </div>
    `).join('');

    const apDoctor = document.getElementById('apDoctor');
    if (apDoctor) {
      apDoctor.innerHTML = '<option value="">Выберите врача</option>' +
        staff.filter(s => s.position === 'врач').map(d =>
          `<option value="${d.id}">${d.last_name} ${d.first_name} — ${d.specialty}</option>`
        ).join('');
    }
  } catch (e) {
    grid.innerHTML = '<p style="color:red;text-align:center;grid-column:1/-1;">Не удалось загрузить специалистов</p>';
  }
}

let selectedSlotId = null;

async function loadAvailableSlots() {
  const picker = document.getElementById('slotPicker');
  const slotInput = document.getElementById('apSlotId');
  const doctorId = document.getElementById('apDoctor')?.value;
  const date = document.getElementById('apDate')?.value;

  selectedSlotId = null;
  if (slotInput) slotInput.value = '';

  if (!picker) return;

  if (!doctorId || !date) {
    picker.innerHTML = '<p class="slot-picker__hint">Выберите врача и дату, чтобы увидеть доступное время</p>';
    return;
  }

  picker.innerHTML = '<p class="slot-picker__hint">Загрузка...</p>';

  try {
    const slots = await fetchJSON(`${API}/slots?staff_id=${doctorId}&date=${date}&available=true`);

    if (!slots.length) {
      picker.innerHTML = '<p class="slot-picker__hint">На эту дату нет свободных окон. Выберите другую дату.</p>';
      return;
    }

    picker.innerHTML = slots.map(s => `
      <button type="button" class="slot-btn" data-slot-id="${s.id}" data-time="${s.slot_time}">
        ${s.slot_time.slice(0, 5)}
      </button>
    `).join('');

    picker.querySelectorAll('.slot-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        picker.querySelectorAll('.slot-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        selectedSlotId = btn.dataset.slotId;
        if (slotInput) slotInput.value = selectedSlotId;
      });
    });
  } catch (e) {
    picker.innerHTML = '<p class="slot-picker__hint slot-picker__hint--error">Не удалось загрузить время</p>';
  }
}

function showSuccessModal(date, time) {
  const modal = document.getElementById('successModal');
  const text = document.getElementById('successText');
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  text.textContent = `Вы записаны на ${formattedDate} в ${time.slice(0, 5)}. Ждём вас в клинике!`;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function initModal() {
  const modal = document.getElementById('appointmentModal');
  const successModal = document.getElementById('successModal');
  const openBtns = [
    document.getElementById('openAppointment'),
    document.getElementById('heroAppointment'),
    document.getElementById('footerAppointment'),
  ].filter(Boolean);

  const open = () => {
    modal.classList.add('active');
    document.body.style.overflow = 'hidden';
    const dateInput = document.getElementById('apDate');
    if (dateInput) {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      dateInput.min = tomorrow.toISOString().split('T')[0];
    }
    const phone = document.getElementById('apPhone');
    if (phone && !phone.value.trim()) phone.value = '+7 ';
  };

  const close = () => {
    modal.classList.remove('active');
    document.body.style.overflow = '';
  };

  openBtns.forEach(btn => btn.addEventListener('click', (e) => {
    e.preventDefault();
    open();
  }));

  document.getElementById('closeModal')?.addEventListener('click', close);
  modal?.addEventListener('click', (e) => { if (e.target === modal) close(); });

  document.getElementById('closeSuccess')?.addEventListener('click', () => {
    successModal.classList.remove('active');
    document.body.style.overflow = '';
  });

  document.getElementById('apDoctor')?.addEventListener('change', loadAvailableSlots);
  document.getElementById('apDate')?.addEventListener('change', loadAvailableSlots);

  document.getElementById('appointmentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('formMessage');
    msg.className = 'form-message';
    msg.style.display = 'none';

    const slotId = document.getElementById('apSlotId')?.value;
    if (!slotId) {
      msg.textContent = 'Выберите время приёма из списка';
      msg.className = 'form-message error';
      return;
    }

    if (!document.getElementById('apConsent')?.checked) {
      msg.textContent = 'Необходимо согласие на обработку персональных данных';
      msg.className = 'form-message error';
      return;
    }

    try {
      const result = await fetchJSON(`${API}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: parseInt(slotId, 10),
          staff_id: document.getElementById('apDoctor').value,
          service_id: document.getElementById('apService').value || null,
          patient_name: document.getElementById('apName').value,
          patient_phone: document.getElementById('apPhone').value,
          patient_email: document.getElementById('apEmail')?.value || null,
          comment: document.getElementById('apComment').value,
          consent_accepted: true,
          pay_online: document.getElementById('apPayOnline')?.checked || false,
        }),
      });

      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }

      close();
      e.target.reset();
      document.getElementById('apPhone').value = '+7 ';
      document.getElementById('slotPicker').innerHTML =
        '<p class="slot-picker__hint">Выберите врача и дату, чтобы увидеть доступное время</p>';
      showSuccessModal(result.appointment_date, result.appointment_time);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = 'form-message error';
    }
  });
}

function initBurger() {
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  burger?.addEventListener('click', () => nav.classList.toggle('open'));
}

document.addEventListener('DOMContentLoaded', () => {
  loadPublicConfig();
  loadClinicInfo();
  loadServices();
  loadDoctors();
  initPhoneMask();
  initModal();
  initBurger();
});
