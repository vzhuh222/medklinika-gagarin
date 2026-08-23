const syncStatusMap = {
  local: 'Локально',
  pending: 'Отправка…',
  synced: 'Синхронизировано',
  failed: 'Ошибка',
};

async function loadIntegrationsPanel() {
  const root = document.getElementById('integrationsRoot');
  if (!root) return;

  try {
    const [readiness, logs] = await Promise.all([
      fetchJSON('/api/integrations/readiness'),
      fetchJSON('/api/integrations/medflex/logs'),
    ]);

    const { status, items, mappings, progress } = readiness;

    root.innerHTML = `
      <div class="integration-banner">
        <strong>МИС МедЛок</strong> — интеграция через платформу <strong>МедФлекс</strong>.
        Прямого API у МедЛок нет. После договора с клиникой заполните настройки на сервере и сопоставьте ID ниже.
        <a href="https://help.medlock.me/kak_vklyuchit_onlajn_zapis/" target="_blank" rel="noopener">Документация МедЛок</a>
      </div>

      <div class="integration-cards">
        <div class="integration-card">
          <div class="integration-card__label">Готовность</div>
          <div class="integration-card__value">${progress}</div>
        </div>
        <div class="integration-card">
          <div class="integration-card__label">MedFlex</div>
          <div class="integration-card__value">${status.medflex.enabled && status.medflex.configured ? '✅ Настроен' : '⏳ Ожидает ключи'}</div>
        </div>
        <div class="integration-card">
          <div class="integration-card__label">Режим</div>
          <div class="integration-card__value">${status.medflex.mode || 'native'}</div>
        </div>
        <div class="integration-card">
          <div class="integration-card__label">Webhook (входящий)</div>
          <div class="integration-card__value integration-card__value--small">${status.medflex.inboundWebhook}</div>
        </div>
      </div>

      <div class="admin-form">
        <div class="admin-form__title">Чек-лист подключения</div>
        <ul class="checklist">
          ${items.map(item => `
            <li class="checklist__item ${item.done ? 'checklist__item--done' : ''}">
              <span class="checklist__mark">${item.done ? '✓' : '○'}</span>
              <div>
                <strong>${item.label}</strong>
                ${item.progress ? `<span class="checklist__progress">${item.progress}</span>` : ''}
                <p class="checklist__hint">${item.hint}</p>
              </div>
            </li>
          `).join('')}
        </ul>
      </div>

      <div class="admin-form">
        <div class="admin-form__title">Сопоставление врачей (ID МедФлекс / МедЛок)</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Врач</th><th>Специальность</th><th>ID в МедФлекс</th><th></th></tr></thead>
            <tbody id="doctorMappingTable"></tbody>
          </table>
        </div>
      </div>

      <div class="admin-form">
        <div class="admin-form__title">Сопоставление услуг</div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Услуга</th><th>Категория</th><th>ID в МедФлекс</th><th></th></tr></thead>
            <tbody id="serviceMappingTable"></tbody>
          </table>
        </div>
      </div>

      <div class="admin-form">
        <div class="admin-form__title" style="display:flex;justify-content:space-between;align-items:center;">
          <span>Журнал синхронизации</span>
          <button type="button" class="btn btn--outline btn--sm" id="retryFailedBtn">Повторить ошибки</button>
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Дата</th><th>Направление</th><th>Сущность</th><th>Статус</th><th>Ошибка</th></tr></thead>
            <tbody id="syncLogsTable"></tbody>
          </table>
        </div>
      </div>
    `;

    const { staff, services } = await fetchJSON('/api/integrations/mappings');

    document.getElementById('doctorMappingTable').innerHTML = staff.filter(s => s.is_active).map(s => `
      <tr>
        <td>${s.last_name} ${s.first_name}</td>
        <td>${s.specialty}</td>
        <td><input type="text" class="mapping-input" data-staff-id="${s.id}" value="${s.medflex_doctor_id || ''}" placeholder="doctor_id из МедФлекс"></td>
        <td><button type="button" class="btn btn--primary btn--sm save-mapping-staff" data-id="${s.id}">Сохранить</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4">Нет врачей</td></tr>';

    document.getElementById('serviceMappingTable').innerHTML = services.filter(s => s.is_active).map(s => `
      <tr>
        <td>${s.name}</td>
        <td>${s.category}</td>
        <td><input type="text" class="mapping-input" data-service-id="${s.id}" value="${s.medflex_service_id || ''}" placeholder="service_id из МедФлекс"></td>
        <td><button type="button" class="btn btn--primary btn--sm save-mapping-service" data-id="${s.id}">Сохранить</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4">Нет услуг</td></tr>';

    document.getElementById('syncLogsTable').innerHTML = logs.length ? logs.map(l => `
      <tr>
        <td>${new Date(l.created_at).toLocaleString('ru-RU')}</td>
        <td>${l.direction === 'outbound' ? '→ МедФлекс' : '← МедФлекс'}</td>
        <td>${l.entity_type} #${l.entity_id || '—'}</td>
        <td><span class="badge ${l.status === 'success' ? 'badge--green' : l.status === 'failed' ? 'badge--red' : 'badge--blue'}">${l.status}</span></td>
        <td style="font-size:12px;color:var(--text-muted);">${l.error_message || '—'}</td>
      </tr>
    `).join('') : '<tr><td colspan="5">Записей пока нет</td></tr>';

    root.querySelectorAll('.save-mapping-staff').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const input = root.querySelector(`input[data-staff-id="${id}"]`);
        await fetchJSON(`/api/integrations/mappings/staff/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ medflex_doctor_id: input.value.trim() || null }),
        });
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = 'Сохранить'; }, 1500);
      });
    });

    root.querySelectorAll('.save-mapping-service').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const input = root.querySelector(`input[data-service-id="${id}"]`);
        await fetchJSON(`/api/integrations/mappings/services/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ medflex_service_id: input.value.trim() || null }),
        });
        btn.textContent = '✓';
        setTimeout(() => { btn.textContent = 'Сохранить'; }, 1500);
      });
    });

    document.getElementById('retryFailedBtn')?.addEventListener('click', async () => {
      const result = await fetchJSON('/api/integrations/medflex/retry-failed', { method: 'POST' });
      alert(`Повторено: ${result.retried}, успешно: ${result.results.filter(r => r.ok).length}`);
      loadIntegrationsPanel();
    });
  } catch (err) {
    root.innerHTML = `<p class="form-message error">${err.message}</p>`;
  }
}

window.loadIntegrationsPanel = loadIntegrationsPanel;
