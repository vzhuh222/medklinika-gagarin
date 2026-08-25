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
                <strong>${escapeHtml(item.label)}</strong>
                ${item.progress ? `<span class="checklist__progress">${escapeHtml(item.progress)}</span>` : ''}
                <p class="checklist__hint">${escapeHtml(item.hint)}</p>
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
        <td>${escapeHtml(`${s.last_name} ${s.first_name}`)}</td>
        <td>${escapeHtml(s.specialty)}</td>
        <td><input type="text" class="mapping-input" data-staff-id="${s.id}" value="${escapeHtml(s.medflex_doctor_id)}" placeholder="doctor_id из МедФлекс"></td>
        <td><button type="button" class="btn btn--primary btn--sm save-mapping-staff" data-id="${s.id}">Сохранить</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="table-empty">Нет врачей</td></tr>';

    document.getElementById('serviceMappingTable').innerHTML = services.filter(s => s.is_active).map(s => `
      <tr>
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.category)}</td>
        <td><input type="text" class="mapping-input" data-service-id="${s.id}" value="${escapeHtml(s.medflex_service_id)}" placeholder="service_id из МедФлекс"></td>
        <td><button type="button" class="btn btn--primary btn--sm save-mapping-service" data-id="${s.id}">Сохранить</button></td>
      </tr>
    `).join('') || '<tr><td colspan="4" class="table-empty">Нет услуг</td></tr>';

    document.getElementById('syncLogsTable').innerHTML = logs.length ? logs.map(l => `
      <tr>
        <td>${new Date(l.created_at).toLocaleString('ru-RU')}</td>
        <td>${l.direction === 'outbound' ? '→ МедФлекс' : '← МедФлекс'}</td>
        <td>${escapeHtml(l.entity_type)} #${l.entity_id || '—'}</td>
        <td><span class="badge ${l.status === 'success' ? 'badge--green' : l.status === 'failed' ? 'badge--red' : 'badge--blue'}">${escapeHtml(l.status)}</span></td>
        <td class="log-error">${escapeHtml(l.error_message) || '—'}</td>
      </tr>
    `).join('') : '<tr><td colspan="5" class="table-empty">Записей пока нет</td></tr>';

    function bindMapping(selector, buildUrl, buildBody) {
      root.querySelectorAll(selector).forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          const input = root.querySelector(`input[data-${btn.dataset.field}="${id}"]`);
          btn.disabled = true;
          try {
            await fetchJSON(buildUrl(id), {
              method: 'PUT',
              body: JSON.stringify(buildBody(input.value.trim() || null)),
            });
            btn.textContent = '✓';
            setTimeout(() => { btn.textContent = 'Сохранить'; }, 1500);
          } catch (err) {
            notifyIntegration(err.message);
          } finally {
            btn.disabled = false;
          }
        });
      });
    }

    root.querySelectorAll('.save-mapping-staff').forEach(b => { b.dataset.field = 'staff-id'; });
    root.querySelectorAll('.save-mapping-service').forEach(b => { b.dataset.field = 'service-id'; });

    bindMapping('.save-mapping-staff',
      id => `/api/integrations/mappings/staff/${id}`,
      value => ({ medflex_doctor_id: value }));

    bindMapping('.save-mapping-service',
      id => `/api/integrations/mappings/services/${id}`,
      value => ({ medflex_service_id: value }));

    document.getElementById('retryFailedBtn')?.addEventListener('click', async () => {
      try {
        const result = await fetchJSON('/api/integrations/medflex/retry-failed', { method: 'POST' });
        const ok = result.results.filter(r => r.ok).length;
        notifyIntegration(`Повторено: ${result.retried}, успешно: ${ok}`, 'success');
        loadIntegrationsPanel();
      } catch (err) {
        notifyIntegration(err.message);
      }
    });
  } catch (err) {
    root.innerHTML = `<p class="form-message error">${escapeHtml(err.message)}</p>`;
  }
}

function notifyIntegration(message, type = 'error') {
  if (typeof showToast === 'function') showToast(message, type);
  else console.log(message);
}

window.loadIntegrationsPanel = loadIntegrationsPanel;
