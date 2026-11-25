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

  const ICONS = {
    clock: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    tag: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    check: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
    close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  };

  const THEME_VARS = `
    :host {
      --bg-surface: #ffffff;
      --bg-canvas: #faf9f6;
      --bg-subtle: #f3f2ee;
      --bg-hover: #eae8e1;
      --primary: #0f766e;
      --primary-hover: #0d625b;
      --primary-soft: #e6f4f1;
      --primary-border: rgba(15, 118, 110, 0.25);
      --amber-soft: #fef3c7;
      --amber-border: rgba(217, 119, 6, 0.35);
      --amber-text: #b45309;
      --danger-soft: #fee2e2;
      --danger-border: rgba(220, 38, 38, 0.3);
      --danger-text: #b91c1c;
      --text-main: #1e293b;
      --text-muted: #64748b;
      --border-subtle: rgba(30, 41, 59, 0.1);
      --shadow-pop: 0 12px 32px -4px rgba(15, 23, 42, 0.16), 0 4px 12px -2px rgba(15, 23, 42, 0.08);
      --ease: cubic-bezier(0.16, 1, 0.3, 1);
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    :host([data-theme="dark"]) {
      --bg-surface: #202c33;
      --bg-canvas: #111b21;
      --bg-subtle: #2a3942;
      --bg-hover: #374248;
      --primary: #2dd4bf;
      --primary-hover: #5eead4;
      --primary-soft: rgba(45, 212, 191, 0.14);
      --primary-border: rgba(45, 212, 191, 0.3);
      --amber-soft: rgba(245, 158, 11, 0.16);
      --amber-border: rgba(245, 158, 11, 0.35);
      --amber-text: #fbbf24;
      --danger-soft: rgba(239, 68, 68, 0.16);
      --danger-border: rgba(239, 68, 68, 0.35);
      --danger-text: #f87171;
      --text-main: #e9edef;
      --text-muted: #8696a0;
      --border-subtle: rgba(134, 150, 160, 0.18);
      --shadow-pop: 0 14px 36px rgba(0, 0, 0, 0.45);
    }
  `;

  const BUTTONS_STYLES = `
    ${THEME_VARS}
    :host {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      margin-right: 8px;
    }
    .zc-hdr-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 32px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-canvas);
      color: var(--text-muted);
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s var(--ease);
      white-space: nowrap;
    }
    .zc-hdr-btn:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
    }
    .zc-hdr-btn:active {
      transform: scale(0.96);
    }
    .zc-hdr-btn.has-followup {
      background: var(--amber-soft);
      border-color: var(--amber-border);
      color: var(--amber-text);
    }
    .zc-hdr-btn.has-tag {
      background: var(--primary-soft);
      border-color: var(--primary-border);
      color: var(--primary);
    }
  `;

  const BADGE_BTN_STYLES = `
    ${THEME_VARS}
    :host {
      display: inline-flex;
      align-items: center;
      margin-right: 6px;
    }
    .zc-badge-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 30px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-subtle);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.18s var(--ease);
    }
    .zc-badge-btn:hover {
      background: var(--bg-hover);
      color: var(--text-main);
    }
    .zc-badge-btn:active {
      transform: scale(0.96);
    }
    .zc-badge-btn.has-pending {
      background: var(--amber-soft);
      border-color: var(--amber-border);
      color: var(--amber-text);
    }
    .zc-badge-btn.has-overdue {
      background: var(--danger-soft);
      border-color: var(--danger-border);
      color: var(--danger-text);
    }
  `;

  const PORTAL_STYLES = `
    ${THEME_VARS}
    :host {
      position: fixed;
      top: 0;
      left: 0;
      width: 0;
      height: 0;
      z-index: 999999;
    }
    .zc-popover {
      display: none;
      position: fixed;
      width: 300px;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      box-shadow: var(--shadow-pop);
      padding: 14px;
      box-sizing: border-box;
      color: var(--text-main);
      animation: popIn 0.2s var(--ease);
    }
    .zc-popover.open {
      display: block;
    }
    @keyframes popIn {
      from {
        opacity: 0;
        transform: translateY(-6px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }
    .zc-pop-title {
      font-size: 13.5px;
      font-weight: 700;
      color: var(--text-main);
      margin-bottom: 12px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-subtle);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .zc-close-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 8px;
      transition: background 0.15s, color 0.15s;
    }
    .zc-close-btn:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
    }
    .zc-quick-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      margin-bottom: 10px;
    }
    .zc-opt-btn {
      padding: 8px 10px;
      border-radius: 10px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-canvas);
      color: var(--text-main);
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      text-align: center;
      transition: all 0.16s var(--ease);
    }
    .zc-opt-btn:hover {
      background: var(--bg-subtle);
    }
    .zc-opt-btn.active {
      background: var(--primary-soft);
      border-color: var(--primary-border);
      color: var(--primary);
      font-weight: 700;
    }
    .zc-note-chips {
      display: flex;
      gap: 5px;
      flex-wrap: wrap;
      margin-bottom: 8px;
    }
    .zc-chip-btn {
      padding: 4px 8px;
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-subtle);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .zc-chip-btn:hover {
      background: var(--primary-soft);
      color: var(--primary);
      border-color: var(--primary-border);
    }
    .zc-input {
      width: 100%;
      padding: 9px 11px;
      border: 1px solid var(--border-subtle);
      border-radius: 10px;
      background: var(--bg-canvas);
      color: var(--text-main);
      font-size: 12.5px;
      margin-bottom: 10px;
      box-sizing: border-box;
      outline: none;
      font-family: inherit;
      transition: border-color 0.18s, box-shadow 0.18s;
    }
    .zc-input:focus {
      border-color: var(--primary);
      box-shadow: 0 0 0 3px var(--primary-soft);
    }
    .zc-save-btn {
      width: 100%;
      padding: 9px 12px;
      border: none;
      border-radius: 10px;
      background: #0f766e;
      color: #ffffff;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.18s, transform 0.15s;
    }
    .zc-save-btn:hover {
      background: #0d625b;
    }
    .zc-save-btn:active {
      transform: scale(0.98);
    }
    .zc-danger-btn {
      width: 100%;
      margin-top: 7px;
      padding: 8px;
      border: 1px solid var(--danger-border);
      border-radius: 10px;
      background: var(--danger-soft);
      color: var(--danger-text);
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.15s;
    }
    .zc-danger-btn:hover {
      opacity: 0.9;
    }
    .zc-tag-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 9px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-main);
      transition: background 0.15s;
    }
    .zc-tag-row:hover {
      background: var(--bg-subtle);
    }
    .zc-tag-dot {
      display: inline-block;
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-right: 9px;
      flex-shrink: 0;
    }
    .zc-check-box {
      width: 18px;
      height: 18px;
      border-radius: 6px;
      border: 1.5px solid var(--border-subtle);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      color: transparent;
      transition: all 0.15s;
    }
    .zc-check-box.checked {
      background: var(--primary);
      border-color: var(--primary);
      color: #ffffff;
    }
    :host([data-theme="dark"]) .zc-check-box.checked {
      color: #0b141a;
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
      padding: 9px 10px;
      border-radius: 10px;
      cursor: pointer;
      margin-bottom: 4px;
      transition: background 0.15s;
    }
    .zc-fu-item:hover {
      background: var(--bg-subtle);
    }
    .zc-fu-name {
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
    }
    .zc-fu-note {
      font-size: 11.5px;
      color: var(--text-muted);
      margin-top: 2px;
    }
    .zc-fu-time {
      font-size: 11px;
      font-weight: 600;
      margin-top: 4px;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .zc-fu-time.overdue { color: var(--danger-text); }
    .zc-fu-time.upcoming { color: var(--primary); }
    .zc-done-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid var(--primary-border);
      background: var(--primary-soft);
      border-radius: 8px;
      padding: 5px 9px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      color: var(--primary);
      flex-shrink: 0;
      transition: transform 0.15s;
    }
    .zc-done-btn:hover {
      transform: scale(1.03);
    }
  `;

  function isDarkMode() {
    return document.body?.classList.contains('dark') ||
      document.documentElement?.getAttribute('data-theme') === 'dark';
  }

  function syncTheme() {
    const theme = isDarkMode() ? 'dark' : 'light';
    [headerHost, badgeHost, portalHost].forEach(host => {
      if (host && host.getAttribute('data-theme') !== theme) {
        host.setAttribute('data-theme', theme);
      }
    });
  }

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
    if (document.getElementById('zap-copilot-portal-host')) {
      syncTheme();
      return;
    }

    portalHost = document.createElement('div');
    portalHost.id = 'zap-copilot-portal-host';
    portalShadow = portalHost.attachShadow({ mode: 'open' });

    portalShadow.innerHTML = `
      <style>${PORTAL_STYLES}</style>

      <!-- Popover 1: Agendar Follow-up -->
      <div class="zc-popover" id="zc-pop-fu">
        <div class="zc-pop-title">
          <span>Agendar Retorno</span>
          <button type="button" class="zc-close-btn" data-close="zc-pop-fu" aria-label="Fechar">${ICONS.close}</button>
        </div>
        <div class="zc-quick-grid">
          <button type="button" class="zc-opt-btn active" data-preset="2h">Em 2 horas</button>
          <button type="button" class="zc-opt-btn" data-preset="tomorrow9">Amanhã às 09h</button>
          <button type="button" class="zc-opt-btn" data-preset="3d">Em 3 dias</button>
          <button type="button" class="zc-opt-btn" data-preset="custom">Personalizado</button>
        </div>
        <input type="datetime-local" class="zc-input" id="zc-custom-dt" style="display:none;">
        <div class="zc-note-chips">
          <button type="button" class="zc-chip-btn" data-quick-note="Cobrar retorno do orçamento de {nome}">Cobrar orçamento</button>
          <button type="button" class="zc-chip-btn" data-quick-note="Confirmar agendamento com {nome}">Confirmar horário</button>
          <button type="button" class="zc-chip-btn" data-quick-note="Verificar se {nome} recebeu a proposta">Checar proposta</button>
        </div>
        <input type="text" class="zc-input" id="zc-fu-note" placeholder="Nota curta (use {nome} se quiser)">
        <button type="button" class="zc-save-btn" id="zc-save-fu">Salvar Lembrete</button>
        <button type="button" class="zc-danger-btn" id="zc-remove-fu" style="display:none;">Concluir / Remover Lembrete</button>
      </div>

      <!-- Popover 2: Etiquetas do Contato -->
      <div class="zc-popover" id="zc-pop-tag">
        <div class="zc-pop-title">
          <span>Etiquetas do Contato</span>
          <button type="button" class="zc-close-btn" data-close="zc-pop-tag" aria-label="Fechar">${ICONS.close}</button>
        </div>
        <div id="zc-tags-list"></div>
      </div>

      <!-- Popover 3: Lista de Pendências (Topo Esquerdo) -->
      <div class="zc-popover" id="zc-pop-pending" style="width: 325px;">
        <div class="zc-pop-title">
          <span>Pendências de Follow-up</span>
          <button type="button" class="zc-close-btn" data-close="zc-pop-pending" aria-label="Fechar">${ICONS.close}</button>
        </div>
        <div class="zc-fu-list" id="zc-fu-pending-list"></div>
      </div>
    `;

    document.body.appendChild(portalHost);
    syncTheme();
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
    const popWidth = parseInt(targetPop.style.width || '300', 10);

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
    const noteInput = portalShadow.getElementById('zc-fu-note');

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

    portalShadow.querySelectorAll('[data-quick-note]').forEach(chip => {
      chip.addEventListener('click', () => {
        const rawNote = chip.dataset.quickNote || '';
        const resolver = window.ZapCopilot.Composer?.resolveVariables;
        noteInput.value = resolver ? resolver(rawNote) : rawNote;
        noteInput.focus();
      });
    });

    portalShadow.getElementById('zc-save-fu').addEventListener('click', async () => {
      const contact = Selectors.getActiveContactInfo();
      if (!contact) return;

      let dueAt = getPresetTimestamp(selectedPreset);
      if (selectedPreset === 'custom' && customDt.value) {
        dueAt = new Date(customDt.value).getTime();
      }
      const rawNote = noteInput.value.trim();
      const resolver = window.ZapCopilot.Composer?.resolveVariables;
      const note = resolver ? resolver(rawNote) : rawNote;

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
      syncTheme();
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
          ${ICONS.clock}
          <span id="zc-fu-label">Follow-up</span>
        </button>
        <button type="button" class="zc-hdr-btn" id="zc-btn-tag" title="Etiquetar conversa">
          ${ICONS.tag}
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
      syncTheme();
      await updateHeaderState(contact.contactKey);
    } finally {
      isMountingHeader = false;
    }
  }

  async function updateHeaderState(contactKey) {
    if (!headerShadow || !portalShadow) return;
    const state = await CopilotStorage.getAll();

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
    if (state.customTags.length === 0) {
      tagsListEl.innerHTML = `<div style="padding:12px;text-align:center;font-size:12px;color:var(--text-muted);">Nenhuma etiqueta cadastrada no popup ainda.</div>`;
      return;
    }

    state.customTags.forEach(tag => {
      const checked = assignedIds.includes(tag.id);
      const row = document.createElement('div');
      row.className = 'zc-tag-row';
      row.innerHTML = `
        <span style="display:inline-flex;align-items:center;">
          <span class="zc-tag-dot" style="background:${tag.color}"></span>
          <span>${tag.label}</span>
        </span>
        <span class="zc-check-box ${checked ? 'checked' : ''}">${ICONS.check}</span>
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
      syncTheme();
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
          ${ICONS.clock}
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
      syncTheme();
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
      listEl.innerHTML = `<div style="padding:14px;text-align:center;font-size:12.5px;color:var(--text-muted);">Nenhum follow-up pendente!</div>`;
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
            ${ICONS.clock} ${isOverdue ? 'Vencido: ' : ''}${formatDueTime(item.dueAt)}
          </div>
        </div>
        <button type="button" class="zc-done-btn" title="Marcar como concluído">${ICONS.check} Feito</button>
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
    const themeObserver = new MutationObserver(() => syncTheme());
    if (document.body) {
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

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