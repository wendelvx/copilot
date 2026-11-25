window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.FollowupUI = (() => {
  const { Selectors, Storage: CopilotStorage, DomObserver } = window.ZapCopilot;

  let headerHost = null;
  let headerShadow = null;
  let badgeHost = null;
  let badgeShadow = null;
  let portalHost = null;
  let portalShadow = null;

  let isMountingHeader = false;
  let isMountingBadge = false;
  let selectedPreset = '2h';

  const BUTTONS_STYLES = `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .zc-hdr-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 34px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid #d1d7db;
      background: #ffffff;
      color: #54656f;
      font-size: 12.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
      white-space: nowrap;
    }
    .zc-hdr-btn:hover {
      background: #f0f2f5;
      color: #111b21;
    }
    .zc-hdr-btn.has-followup {
      background: #fff8e6;
      border-color: #f59e0b;
      color: #b45309;
      font-weight: 600;
    }
    .zc-hdr-btn.has-tag {
      background: #e7fce3;
      border-color: #25d366;
      color: #008069;
    }
  `;

  const BADGE_BTN_STYLES = `
    :host {
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .zc-badge-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 30px;
      padding: 0 10px;
      border-radius: 999px;
      border: 1px solid #d1d7db;
      background: #f0f2f5;
      color: #54656f;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s;
    }
    .zc-badge-btn:hover {
      background: #e9edef;
    }
    .zc-badge-btn.has-pending {
      background: #fef3c7;
      border-color: #f59e0b;
      color: #b45309;
    }
    .zc-badge-btn.has-overdue {
      background: #fee2e2;
      border-color: #ef4444;
      color: #b91c1c;
    }
  `;

  const PORTAL_STYLES = `
    :host {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .zc-popover {
      display: none;
      position: fixed;
      width: 290px;
      background: #ffffff;
      border: 1px solid #d1d7db;
      border-radius: 12px;
      box-shadow: 0 10px 30px rgba(11, 20, 26, 0.22);
      padding: 12px;
      box-sizing: border-box;
      color: #111b21;
    }
    .zc-popover.open {
      display: block;
    }
    .zc-pop-title {
      font-size: 13px;
      font-weight: 700;
      color: #111b21;
      margin-bottom: 10px;
      padding-bottom: 6px;
      border-bottom: 1px solid #f0f2f5;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .zc-close-btn {
      background: none;
      border: none;
      font-size: 14px;
      color: #667781;
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 6px;
    }
    .zc-close-btn:hover {
      background: #f0f2f5;
      color: #111b21;
    }
    .zc-quick-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 8px;
    }
    .zc-opt-btn {
      padding: 7px 8px;
      border-radius: 8px;
      border: 1px solid #d1d7db;
      background: #f8f9fa;
      color: #111b21;
      font-size: 12px;
      cursor: pointer;
      text-align: center;
    }
    .zc-opt-btn:hover, .zc-opt-btn.active {
      background: #e7fce3;
      border-color: #25d366;
      color: #008069;
      font-weight: 600;
    }
    .zc-input {
      width: 100%;
      padding: 8px 10px;
      border: 1px solid #d1d7db;
      border-radius: 8px;
      font-size: 12.5px;
      margin-bottom: 8px;
      box-sizing: border-box;
      outline: none;
      font-family: inherit;
    }
    .zc-input:focus {
      border-color: #008069;
    }
    .zc-save-btn {
      width: 100%;
      padding: 8px;
      border: none;
      border-radius: 8px;
      background: #008069;
      color: #fff;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
    }
    .zc-save-btn:hover {
      background: #017561;
    }
    .zc-danger-btn {
      width: 100%;
      margin-top: 6px;
      padding: 7px;
      border: 1px solid #fecaca;
      border-radius: 8px;
      background: #fef2f2;
      color: #dc2626;
      font-size: 12px;
      cursor: pointer;
    }
    .zc-danger-btn:hover {
      background: #fee2e2;
    }
    .zc-tag-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13px;
      color: #111b21;
    }
    .zc-tag-row:hover {
      background: #f0f2f5;
    }
    .zc-tag-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 8px;
    }
    .zc-fu-list {
      max-height: 290px;
      overflow-y: auto;
    }
    .zc-fu-item {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 8px;
      padding: 8px;
      border-radius: 8px;
      cursor: pointer;
      border-bottom: 1px solid #f0f2f5;
    }
    .zc-fu-item:hover {
      background: #f0f2f5;
    }
    .zc-fu-name {
      font-size: 13px;
      font-weight: 600;
      color: #111b21;
    }
    .zc-fu-note {
      font-size: 11.5px;
      color: #54656f;
      margin-top: 2px;
    }
    .zc-fu-time {
      font-size: 11px;
      font-weight: 600;
      margin-top: 3px;
    }
    .zc-fu-time.overdue { color: #dc2626; }
    .zc-fu-time.upcoming { color: #008069; }
    .zc-done-btn {
      border: 1px solid #d1d7db;
      background: #fff;
      border-radius: 6px;
      padding: 4px 8px;
      font-size: 11px;
      cursor: pointer;
      color: #008069;
      flex-shrink: 0;
    }
    .zc-done-btn:hover {
      background: #e7fce3;
    }
  `;

  function formatDueTime(ts) {
    const d = new Date(ts);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const timeStr = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (isToday) return `Hoje às ${timeStr}`;
    return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} às ${timeStr}`;
  }

  function getPresetTimestamp(preset) {
    const now = new Date();
    if (preset === '2h') return Date.now() + 2 * 60 * 60 * 1000;
    if (preset === 'tomorrow9') {
      const t = new Date(now);
      t.setDate(t.getDate() + 1);
      t.setHours(9, 0, 0, 0);
      return t.getTime();
    }
    if (preset === '3d') {
      const t = new Date(now);
      t.setDate(t.getDate() + 3);
      t.setHours(9, 0, 0, 0);
      return t.getTime();
    }
    return Date.now() + 60 * 60 * 1000;
  }

  // --- Portal Global (fora do overflow:hidden do WhatsApp) ---
  function ensurePortal() {
    if (document.getElementById('zap-copilot-portal-host')) return;

    portalHost = document.createElement('div');
    portalHost.id = 'zap-copilot-portal-host';
    portalShadow = portalHost.attachShadow({ mode: 'open' });

    portalShadow.innerHTML = `
      <style>${PORTAL_STYLES}</style>

      <!-- Popover 1: Agendar Follow-up -->
      <div class="zc-popover" id="zc-pop-fu">
        <div class="zc-pop-title">
          <span>Agendar Retorno</span>
          <button type="button" class="zc-close-btn" data-close="zc-pop-fu">✕</button>
        </div>
        <div class="zc-quick-grid">
          <button type="button" class="zc-opt-btn active" data-preset="2h">Em 2 horas</button>
          <button type="button" class="zc-opt-btn" data-preset="tomorrow9">Amanhã às 09h</button>
          <button type="button" class="zc-opt-btn" data-preset="3d">Em 3 dias</button>
          <button type="button" class="zc-opt-btn" data-preset="custom">Personalizado</button>
        </div>
        <input type="datetime-local" class="zc-input" id="zc-custom-dt" style="display:none;">
        <input type="text" class="zc-input" id="zc-fu-note" placeholder="Nota curta (ex: Cobrar orçamento)">
        <button type="button" class="zc-save-btn" id="zc-save-fu">Salvar Lembrete</button>
        <button type="button" class="zc-danger-btn" id="zc-remove-fu" style="display:none;">Concluir / Remover Lembrete</button>
      </div>

      <!-- Popover 2: Etiquetas do Contato -->
      <div class="zc-popover" id="zc-pop-tag">
        <div class="zc-pop-title">
          <span>Etiquetas do Contato</span>
          <button type="button" class="zc-close-btn" data-close="zc-pop-tag">✕</button>
        </div>
        <div id="zc-tags-list"></div>
      </div>

      <!-- Popover 3: Lista de Pendências (Topo Esquerdo) -->
      <div class="zc-popover" id="zc-pop-pending" style="width: 315px;">
        <div class="zc-pop-title">
          <span>Pendências de Follow-up</span>
          <button type="button" class="zc-close-btn" data-close="zc-pop-pending">✕</button>
        </div>
        <div class="zc-fu-list" id="zc-fu-pending-list"></div>
      </div>
    `;

    document.body.appendChild(portalHost);
    bindPortalEvents();
  }

  function closeAllPopovers() {
    if (!portalShadow) return;
    portalShadow.querySelectorAll('.zc-popover').forEach(p => p.classList.remove('open'));
  }

  function openPopoverAnchored(popoverId, anchorBtn, align = 'right') {
    ensurePortal();
    const targetPop = portalShadow.getElementById(popoverId);
    if (!targetPop) return;

    const wasOpen = targetPop.classList.contains('open');
    closeAllPopovers();
    if (wasOpen) return;

    const rect = anchorBtn.getBoundingClientRect();
    const popWidth = parseInt(targetPop.style.width || '290', 10);

    targetPop.style.top = `${rect.bottom + 8}px`;

    if (align === 'left') {
      const leftPos = Math.min(rect.left, window.innerWidth - popWidth - 12);
      targetPop.style.left = `${Math.max(12, leftPos)}px`;
    } else {
      const leftPos = Math.max(12, rect.right - popWidth);
      targetPop.style.left = `${leftPos}px`;
    }

    targetPop.classList.add('open');
  }

  function bindPortalEvents() {
    const customDt = portalShadow.getElementById('zc-custom-dt');

    portalShadow.querySelectorAll('.zc-close-btn').forEach(btn => {
      btn.addEventListener('click', closeAllPopovers);
    });

    portalShadow.querySelectorAll('.zc-opt-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        portalShadow.querySelectorAll('.zc-opt-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedPreset = btn.dataset.preset;
        customDt.style.display = selectedPreset === 'custom' ? 'block' : 'none';
      });
    });

    portalShadow.getElementById('zc-save-fu').addEventListener('click', async () => {
      const contact = Selectors.getActiveContactInfo();
      if (!contact) return;

      let dueAt = getPresetTimestamp(selectedPreset);
      if (selectedPreset === 'custom' && customDt.value) {
        dueAt = new Date(customDt.value).getTime();
      }
      const note = portalShadow.getElementById('zc-fu-note').value.trim();

      const state = await CopilotStorage.getAll();
      const followups = state.followups.filter(f => f.contactKey !== contact.contactKey || f.completed);
      followups.push({
        id: 'fu_' + Date.now(),
        contactKey: contact.contactKey,
        contactName: contact.contactKey,
        dueAt,
        note,
        notified: false,
        completed: false,
        createdAt: Date.now()
      });

      try {
        await CopilotStorage.saveFollowups(followups);
        closeAllPopovers();
        await updateHeaderState(contact.contactKey);
        await updateSidebarBadge();
      } catch (err) {
        if (err.message === 'LIMIT_FOLLOWUPS') {
          alert('Limite de 3 follow-ups simultâneos atingido no Plano Gratuito. Ative o PRO para lembretes ilimitados!');
        } else {
          alert('Erro ao salvar follow-up: ' + err.message);
        }
      }
    });

    portalShadow.getElementById('zc-remove-fu').addEventListener('click', async () => {
      const contact = Selectors.getActiveContactInfo();
      if (!contact) return;
      const state = await CopilotStorage.getAll();
      const followups = state.followups.map(f =>
        f.contactKey === contact.contactKey ? { ...f, completed: true } : f
      );
      await CopilotStorage.saveFollowups(followups);
      closeAllPopovers();
      await updateHeaderState(contact.contactKey);
      await updateSidebarBadge();
    });

    // Fecha ao clicar fora dos popovers e dos botões gatilho
    document.addEventListener('click', (e) => {
      const path = e.composedPath();
      const clickedInsidePortal = portalHost && path.includes(portalHost);
      const clickedHeaderBtn = headerHost && path.includes(headerHost);
      const clickedBadgeBtn = badgeHost && path.includes(badgeHost);

      if (!clickedInsidePortal && !clickedHeaderBtn && !clickedBadgeBtn) {
        closeAllPopovers();
      }
    });
  }

  // --- 1. Botões no Cabeçalho do Chat Ativo ---
  async function mountChatHeaderControls() {
    if (isMountingHeader) return;
    const header = Selectors.getChatHeader();
    const actionsBox = Selectors.getChatHeaderActions();
    const contact = Selectors.getActiveContactInfo();
    if (!header || !actionsBox || !contact) return;

    ensurePortal();

    const existing = header.querySelector('#zap-copilot-header-host');
    if (existing) {
      await updateHeaderState(contact.contactKey);
      return;
    }

    isMountingHeader = true;
    try {
      headerHost = document.createElement('div');
      headerHost.id = 'zap-copilot-header-host';
      headerShadow = headerHost.attachShadow({ mode: 'open' });

      headerShadow.innerHTML = `
        <style>${BUTTONS_STYLES}</style>
        <button type="button" class="zc-hdr-btn" id="zc-btn-fu" title="Agendar Follow-up">
          <span>🕒</span>
          <span id="zc-fu-label">Follow-up</span>
        </button>
        <button type="button" class="zc-hdr-btn" id="zc-btn-tag" title="Etiquetar conversa">
          <span>🏷️</span>
          <span id="zc-tag-label">Etiqueta</span>
        </button>
      `;

      const fuBtn = headerShadow.getElementById('zc-btn-fu');
      const tagBtn = headerShadow.getElementById('zc-btn-tag');

      fuBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const active = Selectors.getActiveContactInfo();
        if (active) await updateHeaderState(active.contactKey);
        openPopoverAnchored('zc-pop-fu', fuBtn, 'right');
      });

      tagBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const active = Selectors.getActiveContactInfo();
        if (active) await updateHeaderState(active.contactKey);
        openPopoverAnchored('zc-pop-tag', tagBtn, 'right');
      });

      actionsBox.prepend(headerHost);
      await updateHeaderState(contact.contactKey);
    } finally {
      isMountingHeader = false;
    }
  }

  async function updateHeaderState(contactKey) {
    if (!headerShadow || !portalShadow) return;
    const state = await CopilotStorage.getAll();

    // Atualiza botão e campos de Follow-up
    const activeFu = state.followups.find(f => f.contactKey === contactKey && !f.completed);
    const fuBtn = headerShadow.getElementById('zc-btn-fu');
    const fuLabel = headerShadow.getElementById('zc-fu-label');
    const removeBtn = portalShadow.getElementById('zc-remove-fu');
    const noteInput = portalShadow.getElementById('zc-fu-note');

    if (activeFu) {
      fuBtn.classList.add('has-followup');
      fuLabel.textContent = formatDueTime(activeFu.dueAt);
      removeBtn.style.display = 'block';
      noteInput.value = activeFu.note || '';
    } else {
      fuBtn.classList.remove('has-followup');
      fuLabel.textContent = 'Follow-up';
      removeBtn.style.display = 'none';
      noteInput.value = '';
    }

    // Atualiza botão e lista de Etiquetas
    const assignedIds = state.chatTags[contactKey] || [];
    const tagBtn = headerShadow.getElementById('zc-btn-tag');
    const tagLabel = headerShadow.getElementById('zc-tag-label');
    const tagsListEl = portalShadow.getElementById('zc-tags-list');

    if (assignedIds.length > 0) {
      const firstTag = state.customTags.find(t => t.id === assignedIds[0]);
      tagBtn.classList.add('has-tag');
      tagLabel.textContent = firstTag
        ? (assignedIds.length > 1 ? `${firstTag.label} +${assignedIds.length - 1}` : firstTag.label)
        : 'Etiqueta';
    } else {
      tagBtn.classList.remove('has-tag');
      tagLabel.textContent = 'Etiqueta';
    }

    tagsListEl.innerHTML = '';
    state.customTags.forEach(tag => {
      const checked = assignedIds.includes(tag.id);
      const row = document.createElement('div');
      row.className = 'zc-tag-row';
      row.innerHTML = `
        <span><span class="zc-tag-dot" style="background:${tag.color}"></span>${tag.label}</span>
        <span>${checked ? '✅' : '⬜'}</span>
      `;
      row.addEventListener('click', async () => {
        await CopilotStorage.toggleChatTag(contactKey, tag.id);
        await updateHeaderState(contactKey);
      });
      tagsListEl.appendChild(row);
    });
  }

  // --- 2. Selo de Pendências no Topo da Lista de Conversas ---
  async function mountSidebarBadge() {
    if (isMountingBadge) return;
    const actionsArea = Selectors.getSidebarHeaderActions();
    if (!actionsArea) return;

    ensurePortal();

    if (actionsArea.querySelector('#zap-copilot-badge-host')) {
      await updateSidebarBadge();
      return;
    }

    isMountingBadge = true;
    try {
      badgeHost = document.createElement('div');
      badgeHost.id = 'zap-copilot-badge-host';
      badgeShadow = badgeHost.attachShadow({ mode: 'open' });

      badgeShadow.innerHTML = `
        <style>${BADGE_BTN_STYLES}</style>
        <button type="button" class="zc-badge-btn" id="zc-badge-trigger" title="Follow-ups agendados">
          <span>🕒</span>
          <span id="zc-badge-count">0</span>
        </button>
      `;

      const trigger = badgeShadow.getElementById('zc-badge-trigger');
      trigger.addEventListener('click', async (e) => {
        e.stopPropagation();
        await updateSidebarBadge();
        openPopoverAnchored('zc-pop-pending', trigger, 'left');
      });

      actionsArea.prepend(badgeHost);
      await updateSidebarBadge();
    } finally {
      isMountingBadge = false;
    }
  }

  async function updateSidebarBadge() {
    if (!badgeShadow || !portalShadow) return;
    const state = await CopilotStorage.getAll();
    const now = Date.now();
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);

    const active = state.followups
      .filter(f => !f.completed)
      .sort((a, b) => a.dueAt - b.dueAt);

    const dueTodayOrOverdue = active.filter(f => f.dueAt <= endOfToday.getTime());
    const hasOverdue = active.some(f => f.dueAt <= now);

    const btn = badgeShadow.getElementById('zc-badge-trigger');
    const countEl = badgeShadow.getElementById('zc-badge-count');
    const listEl = portalShadow.getElementById('zc-fu-pending-list');

    countEl.textContent = dueTodayOrOverdue.length > 0 ? `${dueTodayOrOverdue.length} hoje` : `${active.length}`;
    btn.classList.toggle('has-pending', dueTodayOrOverdue.length > 0 && !hasOverdue);
    btn.classList.toggle('has-overdue', hasOverdue);

    listEl.innerHTML = '';
    if (active.length === 0) {
      listEl.innerHTML = `<div style="padding:14px;text-align:center;font-size:12.5px;color:#667781;">Nenhum follow-up pendente!</div>`;
      return;
    }

    active.forEach(item => {
      const isOverdue = item.dueAt <= now;
      const row = document.createElement('div');
      row.className = 'zc-fu-item';
      row.innerHTML = `
        <div style="flex:1;min-width:0;">
          <div class="zc-fu-name">${item.contactName}</div>
          ${item.note ? `<div class="zc-fu-note">${item.note}</div>` : ''}
          <div class="zc-fu-time ${isOverdue ? 'overdue' : 'upcoming'}">
            ${isOverdue ? '⚠️ Vencido: ' : '🕒 '}${formatDueTime(item.dueAt)}
          </div>
        </div>
        <button type="button" class="zc-done-btn" title="Marcar como concluído">✓ Feito</button>
      `;

      row.addEventListener('click', async (e) => {
        if (e.target.closest('.zc-done-btn')) return;
        closeAllPopovers();
        await Selectors.openChatByContactKey(item.contactKey);
      });

      row.querySelector('.zc-done-btn').addEventListener('click', async (e) => {
        e.stopPropagation();
        const fresh = await CopilotStorage.getAll();
        const updated = fresh.followups.map(f => f.id === item.id ? { ...f, completed: true } : f);
        await CopilotStorage.saveFollowups(updated);
        await updateSidebarBadge();
        const activeContact = Selectors.getActiveContactInfo();
        if (activeContact?.contactKey === item.contactKey) {
          await updateHeaderState(item.contactKey);
        }
      });

      listEl.appendChild(row);
    });
  }

  function init() {
    DomObserver.on('appReady', () => {
      mountSidebarBadge();
    });
    DomObserver.on('chatChanged', () => {
      closeAllPopovers();
      mountChatHeaderControls();
    });
    DomObserver.on('domUpdated', () => {
      mountSidebarBadge();
      mountChatHeaderControls();
    });
  }

  return { init };
})();