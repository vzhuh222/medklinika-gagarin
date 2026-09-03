const API = '/api';

const SPECIALTY_ICONS = {
  'Терапевт': '🩺',
  'Кардиолог': '❤️',
  'Хирург': '🔬',
  'Гинеколог': '👩‍⚕️',
  'Гинеколог-эндокринолог': '👩‍⚕️',
  'Уролог': '👨‍⚕️',
  'Флеболог': '🩸',
  'Врач УЗИ': '🩻',
  'Невролог': '🧠',
  'Медицинская сестра': '💉',
};

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(price) {
  const value = Number(price);
  if (!value) return 'Уточняйте';
  return `от ${value.toLocaleString('ru-RU')} ₽`;
}

/** Локальная дата в формате YYYY-MM-DD (toISOString сдвигает в UTC). */
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function pluralYears(n) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'год';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'года';
  return 'лет';
}

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Не удалось выполнить запрос');
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

  const countDigits = (str) => (str.match(/\d/g) || []).length;

  input.addEventListener('input', () => {
    const caret = input.selectionStart;
    const digitsBeforeCaret = countDigits(input.value.slice(0, caret));
    const formatted = format(input.value);
    input.value = formatted;

    // Возвращаем курсор после той же по счёту цифры, а не в конец строки.
    let seen = 0;
    let newCaret = formatted.length;
    for (let i = 0; i < formatted.length; i++) {
      if (/\d/.test(formatted[i])) {
        seen++;
        if (seen === digitsBeforeCaret) {
          newCaret = i + 1;
          break;
        }
      }
    }
    input.setSelectionRange(newCaret, newCaret);
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
      if (el && text) el.textContent = text;
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
    set('footerAddress', clinic.address);

    if (clinic.phone) {
      const tel = `tel:+${clinic.phone.replace(/\D/g, '')}`;
      document.querySelectorAll('a[href^="tel:"]').forEach((link) => { link.href = tel; });
    }
  } catch (e) {
    console.error('Не удалось загрузить данные клиники:', e.message);
  }
}

let paymentsEnabled = false;

async function initMedflexWidget(cfg) {
  const section = document.getElementById('medflexBooking');
  const container = document.getElementById('medflexWidgetContainer');
  if (!section || !container) return;

  const showWidget = cfg.medflexWidgetEnabled && (cfg.medflexMode === 'widget' || cfg.medflexMode === 'both');
  const hideNative = cfg.medflexMode === 'widget';

  if (showWidget) {
    try {
      const widget = await fetchJSON(`${API}/integrations/medflex/widget`);
      container.innerHTML = widget.html;
      section.style.display = '';
      container.querySelectorAll('script').forEach((oldScript) => {
        const s = document.createElement('script');
        if (oldScript.src) s.src = oldScript.src;
        else s.textContent = oldScript.textContent;
        oldScript.replaceWith(s);
      });
    } catch (e) {
      console.warn('Виджет МедФлекс недоступен:', e.message);
      section.style.display = 'none';
      return;
    }
  }

  if (hideNative && showWidget) {
    document.querySelectorAll('#openAppointment, #heroAppointment, #footerAppointment').forEach((el) => {
      el.style.display = 'none';
    });
    document.getElementById('appointmentModal')?.remove();
  }
}

async function loadPublicConfig() {
  try {
    const cfg = await fetchJSON(`${API}/config/public`);
    paymentsEnabled = cfg.paymentsEnabled;
    if (cfg.yandexMapsApiKey) initYandexMap(cfg.yandexMapsApiKey);
    else showMapFallback();
    await initMedflexWidget(cfg);
  } catch {
    showMapFallback();
  }
}

function mapSearchUrl(clinic) {
  const query = encodeURIComponent(`${clinic?.name || 'МедКлиника на Гагарина'} ${clinic?.address || 'Киржач Гагарина 37'}`);
  return `https://yandex.ru/maps/?text=${query}`;
}

async function showMapFallback() {
  const el = document.getElementById('yandexMap');
  if (!el) return;

  let clinic = null;
  try {
    clinic = await fetchJSON(`${API}/clinic`);
  } catch { /* показываем запасной вариант без данных */ }

  el.innerHTML = `
    <div class="map-placeholder">
      <div class="map-placeholder__icon">🗺️</div>
      <p><strong>${escapeHtml(clinic?.name || 'МедКлиника на Гагарина')}</strong></p>
      <p>${escapeHtml(clinic?.address || 'Киржач, ул. Гагарина, 37')}</p>
      <a href="${mapSearchUrl(clinic)}" target="_blank" rel="noopener" class="btn btn--outline btn--sm">
        Открыть в Яндекс.Картах
      </a>
    </div>`;
}

function initYandexMap(apiKey) {
  const el = document.getElementById('yandexMap');
  if (!el || !apiKey) return showMapFallback();

  const script = document.createElement('script');
  script.src = `https://api-maps.yandex.ru/2.1/?apikey=${apiKey}&lang=ru_RU`;
  script.onload = () => {
    ymaps.ready(() => {
      fetchJSON(`${API}/clinic`).then((clinic) => {
        if (!clinic?.latitude || !clinic?.longitude) return showMapFallback();

        const coords = [clinic.latitude, clinic.longitude];
        const map = new ymaps.Map('yandexMap', {
          center: coords,
          zoom: 17,
          controls: ['zoomControl', 'routeButtonControl'],
        });
        map.behaviors.disable('scrollZoom');
        map.geoObjects.add(new ymaps.Placemark(coords, {
          balloonContent: `<strong>${escapeHtml(clinic.name)}</strong><br>${escapeHtml(clinic.address)}<br>${escapeHtml(clinic.phone)}`,
          hintContent: clinic.name,
        }, { preset: 'islands#redMedicalIcon' }));
      }).catch(showMapFallback);
    });
  };
  script.onerror = showMapFallback;
  document.head.appendChild(script);
}

function renderServiceCards(services) {
  return services.map((s) => `
    <div class="service-card">
      <div class="service-card__category">${escapeHtml(s.category)}</div>
      <div class="service-card__name">${escapeHtml(s.name)}</div>
      <div class="service-card__desc">${escapeHtml(s.description)}</div>
      <div class="service-card__footer">
        <span class="service-card__price">${formatPrice(s.price_from)}</span>
        ${s.duration_min ? `<span class="service-card__duration">${s.duration_min} мин</span>` : ''}
      </div>
    </div>
  `).join('');
}

async function loadServices() {
  const grid = document.getElementById('servicesGrid');
  if (!grid) return;

  try {
    const services = await fetchJSON(`${API}/services`);

    if (!services.length) {
      grid.innerHTML = '<p class="grid-message">Список услуг пока не заполнен</p>';
      return;
    }

    const categories = [...new Set(services.map((s) => s.category))];
    const filters = document.getElementById('serviceFilters');

    if (filters && categories.length > 1) {
      filters.innerHTML = ['Все', ...categories].map((c, i) => `
        <button type="button" class="filter-chip ${i === 0 ? 'active' : ''}" data-category="${escapeHtml(c)}">
          ${escapeHtml(c)}
        </button>
      `).join('');

      filters.addEventListener('click', (e) => {
        const chip = e.target.closest('.filter-chip');
        if (!chip) return;
        filters.querySelectorAll('.filter-chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const category = chip.dataset.category;
        grid.innerHTML = renderServiceCards(
          category === 'Все' ? services : services.filter((s) => s.category === category),
        );
      });
    }

    grid.innerHTML = renderServiceCards(services);

    const statServices = document.getElementById('statServices');
    if (statServices) statServices.textContent = services.length;

    const apService = document.getElementById('apService');
    if (apService) {
      apService.innerHTML = '<option value="">Выберите услугу</option>' +
        categories.map((category) => `
          <optgroup label="${escapeHtml(category)}">
            ${services.filter((s) => s.category === category).map((s) => `
              <option value="${s.id}" data-price="${s.price_from || 0}">
                ${escapeHtml(s.name)}${s.price_from ? ` — от ${s.price_from} ₽` : ''}
              </option>
            `).join('')}
          </optgroup>
        `).join('');

      apService.addEventListener('change', () => {
        const opt = apService.selectedOptions[0];
        const hasPrice = opt && parseFloat(opt.dataset.price) > 0;
        const group = document.getElementById('payOnlineGroup');
        if (group) group.style.display = paymentsEnabled && hasPrice ? 'block' : 'none';
      });
    }
  } catch (e) {
    grid.innerHTML = `<p class="grid-message grid-message--error">Не удалось загрузить услуги. ${escapeHtml(e.message)}</p>`;
  }
}

async function loadDoctors() {
  const grid = document.getElementById('doctorsGrid');
  if (!grid) return;

  try {
    const staff = await fetchJSON(`${API}/staff`);
    const doctors = staff.filter((s) => s.position === 'врач');

    if (!staff.length) {
      grid.innerHTML = '<p class="grid-message">Список специалистов пока не заполнен</p>';
      return;
    }

    grid.innerHTML = staff.map((d) => `
      <div class="doctor-card">
        <div class="doctor-card__photo">${d.photo_url
          ? `<img src="${escapeHtml(d.photo_url)}" alt="${escapeHtml(`${d.last_name} ${d.first_name}`)}" loading="lazy">`
          : SPECIALTY_ICONS[d.specialty] || '👨‍⚕️'}</div>
        <div class="doctor-card__body">
          <div class="doctor-card__name">${escapeHtml(`${d.last_name} ${d.first_name} ${d.middle_name || ''}`.trim())}</div>
          <div class="doctor-card__specialty">${escapeHtml(d.specialty)}</div>
          ${d.qualification ? `<div class="doctor-card__qual">${escapeHtml(d.qualification)}</div>` : ''}
          ${d.experience_years ? `<div class="doctor-card__exp">Стаж: ${d.experience_years} ${pluralYears(d.experience_years)}</div>` : ''}
          ${d.schedule ? `<div class="doctor-card__schedule">📅 ${escapeHtml(d.schedule)}</div>` : ''}
          ${d.position === 'врач' ? `<button type="button" class="btn btn--outline btn--sm doctor-card__book" data-doctor-id="${d.id}">Записаться</button>` : ''}
        </div>
      </div>
    `).join('');

    const statDoctors = document.getElementById('statDoctors');
    if (statDoctors) statDoctors.textContent = doctors.length;

    const statExperience = document.getElementById('statExperience');
    if (statExperience && doctors.length) {
      statExperience.textContent = `${Math.max(...doctors.map((d) => d.experience_years || 0))}+`;
    }

    const apDoctor = document.getElementById('apDoctor');
    if (apDoctor) {
      apDoctor.innerHTML = '<option value="">Выберите врача</option>' +
        doctors.map((d) => `<option value="${d.id}">${escapeHtml(`${d.last_name} ${d.first_name} — ${d.specialty}`)}</option>`).join('');
    }

    grid.querySelectorAll('.doctor-card__book').forEach((btn) => {
      btn.addEventListener('click', () => {
        const apDoctorSelect = document.getElementById('apDoctor');
        if (apDoctorSelect) apDoctorSelect.value = btn.dataset.doctorId;
        openAppointmentModal();
        loadAvailableSlots();
      });
    });
  } catch (e) {
    grid.innerHTML = `<p class="grid-message grid-message--error">Не удалось загрузить специалистов. ${escapeHtml(e.message)}</p>`;
  }
}

async function loadAvailableSlots() {
  const picker = document.getElementById('slotPicker');
  const slotInput = document.getElementById('apSlotId');
  const doctorId = document.getElementById('apDoctor')?.value;
  const date = document.getElementById('apDate')?.value;

  if (slotInput) slotInput.value = '';
  if (!picker) return;

  if (!doctorId || !date) {
    picker.innerHTML = '<p class="slot-picker__hint">Выберите врача и дату, чтобы увидеть доступное время</p>';
    return;
  }

  picker.innerHTML = '<p class="slot-picker__hint">Загрузка свободного времени…</p>';

  try {
    const slots = await fetchJSON(`${API}/slots?staff_id=${doctorId}&date=${date}&available=true`);

    if (!slots.length) {
      picker.innerHTML = '<p class="slot-picker__hint">На эту дату свободных окон нет. Выберите другую дату или позвоните нам.</p>';
      return;
    }

    picker.innerHTML = slots.map((s) => `
      <button type="button" class="slot-btn" data-slot-id="${s.id}">
        ${escapeHtml(String(s.slot_time).slice(0, 5))}
      </button>
    `).join('');

    picker.querySelectorAll('.slot-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        picker.querySelectorAll('.slot-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        if (slotInput) slotInput.value = btn.dataset.slotId;
      });
    });
  } catch (e) {
    picker.innerHTML = `<p class="slot-picker__hint slot-picker__hint--error">Не удалось загрузить время. ${escapeHtml(e.message)}</p>`;
  }
}

function showSuccessModal(date, time) {
  const modal = document.getElementById('successModal');
  const text = document.getElementById('successText');
  const formattedDate = new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
  text.textContent = `Вы записаны на ${formattedDate} в ${String(time).slice(0, 5)}. Ждём вас в клинике!`;
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function openAppointmentModal() {
  const modal = document.getElementById('appointmentModal');
  if (!modal) return;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';

  const dateInput = document.getElementById('apDate');
  if (dateInput) {
    const today = todayISO();
    dateInput.min = today;
    if (!dateInput.value) dateInput.value = today;
  }

  const phone = document.getElementById('apPhone');
  if (phone && !phone.value.trim()) phone.value = '+7 ';

  setTimeout(() => document.getElementById('apName')?.focus(), 50);
}

function closeAppointmentModal() {
  document.getElementById('appointmentModal')?.classList.remove('active');
  document.body.style.overflow = '';
}

function initModal() {
  const modal = document.getElementById('appointmentModal');
  const successModal = document.getElementById('successModal');
  if (!modal) return;

  [
    document.getElementById('openAppointment'),
    document.getElementById('heroAppointment'),
    document.getElementById('footerAppointment'),
  ].filter(Boolean).forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    openAppointmentModal();
  }));

  document.getElementById('closeModal')?.addEventListener('click', closeAppointmentModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeAppointmentModal(); });

  const closeSuccess = () => {
    successModal?.classList.remove('active');
    document.body.style.overflow = '';
  };
  document.getElementById('closeSuccess')?.addEventListener('click', closeSuccess);
  successModal?.addEventListener('click', (e) => { if (e.target === successModal) closeSuccess(); });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (successModal?.classList.contains('active')) closeSuccess();
    else if (modal.classList.contains('active')) closeAppointmentModal();
  });

  document.getElementById('apDoctor')?.addEventListener('change', loadAvailableSlots);
  document.getElementById('apDate')?.addEventListener('change', loadAvailableSlots);

  document.getElementById('appointmentForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = document.getElementById('formMessage');
    const submitBtn = e.target.querySelector('button[type="submit"]');

    const fail = (text) => {
      msg.textContent = text;
      msg.className = 'form-message error';
      msg.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    msg.className = 'form-message';
    msg.style.display = 'none';

    const slotId = document.getElementById('apSlotId')?.value;
    if (!slotId) return fail('Выберите время приёма из списка');
    if (!document.getElementById('apConsent')?.checked) {
      return fail('Необходимо согласие на обработку персональных данных');
    }

    const originalLabel = submitBtn?.textContent;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Отправляем…';
    }

    try {
      const result = await fetchJSON(`${API}/appointments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slot_id: parseInt(slotId, 10),
          service_id: document.getElementById('apService').value || null,
          patient_name: document.getElementById('apName').value.trim(),
          patient_phone: document.getElementById('apPhone').value,
          patient_email: document.getElementById('apEmail')?.value.trim() || null,
          comment: document.getElementById('apComment').value.trim(),
          consent_accepted: true,
          pay_online: document.getElementById('apPayOnline')?.checked || false,
        }),
      });

      if (result.paymentUrl) {
        window.location.href = result.paymentUrl;
        return;
      }

      closeAppointmentModal();
      e.target.reset();
      document.getElementById('apPhone').value = '+7 ';
      document.getElementById('slotPicker').innerHTML =
        '<p class="slot-picker__hint">Выберите врача и дату, чтобы увидеть доступное время</p>';
      showSuccessModal(result.appointment_date, result.appointment_time);
    } catch (err) {
      fail(err.message);
      loadAvailableSlots();
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalLabel;
      }
    }
  });
}

function initBurger() {
  const burger = document.getElementById('burger');
  const nav = document.getElementById('nav');
  if (!burger || !nav) return;

  const setOpen = (open) => {
    nav.classList.toggle('open', open);
    burger.classList.toggle('open', open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
  };

  burger.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!nav.classList.contains('open'));
  });

  nav.addEventListener('click', (e) => {
    if (e.target.tagName === 'A') setOpen(false);
  });

  document.addEventListener('click', (e) => {
    if (nav.classList.contains('open') && !nav.contains(e.target) && e.target !== burger) {
      setOpen(false);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) setOpen(false);
  });
}

function initFooterYear() {
  const el = document.getElementById('footerYear');
  if (el) el.textContent = new Date().getFullYear();
}

document.addEventListener('DOMContentLoaded', () => {
  loadPublicConfig();
  loadClinicInfo();
  loadServices();
  loadDoctors();
  initPhoneMask();
  initModal();
  initBurger();
  initFooterYear();
});
