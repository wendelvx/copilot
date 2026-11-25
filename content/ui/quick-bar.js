window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.QuickBarUI = (() => {
  const { Selectors, Storage: CopilotStorage, SequenceRunner, DomObserver } = window.ZapCopilot;

  const MAX_VISIBLE_SHORTCUTS = 3;
  let hostEl = null;
  let shadowRoot = null;
  let slashMenuOpen = false;
  let moreMenuOpen = false;
  let slashFilter = '';
  let selectedIndex = 0;
  let filteredShortcuts = [];
  let allShortcuts = [];
  let showQuickBar = true;
  let isMounting = false;

  const ICONS = {
    zap: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
    layers: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    mic: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
    image: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>`,
    doc: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    sliders: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`
  };

  const STYLES = `
    :host {
      --bar-bg: rgba(250, 249, 246, 0.94);
      --bg-surface: #ffffff;
      --bg-canvas: #faf9f6;
      --bg-subtle: #f3f2ee;
      --primary: #0f766e;
      --primary-soft: #e6f4f1;
      --primary-border: rgba(15, 118, 110, 0.25);
      --text-main: #1e293b;
      --text-muted: #64748b;
      --border-subtle: rgba(30, 41, 59, 0.08);
      --shadow-chip: 0 1px 3px rgba(30, 41, 59, 0.04);
      --shadow-pop: 0 12px 32px -4px rgba(15, 23, 42, 0.16), 0 4px 12px -2px rgba(15, 23, 42, 0.08);
      --ease: cubic-bezier(0.16, 1, 0.3, 1);

      display: block;
      width: 100%;
      position: relative;
      z-index: 100;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    :host([data-theme="dark"]) {
      --bar-bg: rgba(32, 44, 51, 0.94);
      --bg-surface: #202c33;
      --bg-canvas: #111b21;
      --bg-subtle: #2a3942;
      --primary: #2dd4bf;
      --primary-soft: rgba(45, 212, 191, 0.14);
      --primary-border: rgba(45, 212, 191, 0.3);
      --text-main: #e9edef;
      --text-muted: #8696a0;
      --border-subtle: rgba(134, 150, 160, 0.16);
      --shadow-chip: 0 1px 3px rgba(0, 0, 0, 0.2);
      --shadow-pop: 0 14px 36px rgba(0, 0, 0, 0.48);
    }

    /* Barra de Acesso Rápido Visual (RF02) */
    .zc-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 7px 14px;
      background: var(--bar-bg);
      border-bottom: 1px solid var(--border-subtle);
      backdrop-filter: blur(8px);
      box-sizing: border-box;
    }

    .zc-bar.hidden {
      display: none;
    }

    .zc-chips-scroll {
      display: flex;
      align-items: center;
      gap: 7px;
      flex: 1;
      min-width: 0;
      padding: 1px 0;
    }

    .zc-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 30px;
      padding: 0 12px;
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-surface);
      color: var(--text-main);
      font-size: 12.5px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      box-shadow: var(--shadow-chip);
      transition: all 0.18s var(--ease);
      user-select: none;
      flex-shrink: 0;
    }

    .zc-chip:hover,
    .zc-chip.active {
      background: var(--primary-soft);
      border-color: var(--primary-border);
      color: var(--primary);
      transform: translateY(-1px);
    }

    .zc-chip:active {
      transform: scale(0.96);
    }

    .zc-more-chip {
      font-weight: 700;
      padding: 0 11px;
      color: var(--primary);
    }

    .zc-chip-icon {
      display: inline-flex;
      align-items: center;
      gap: 3px;
      color: var(--primary);
      font-size: 11px;
      font-weight: 700;
    }

    .zc-chip-cmd {
      color: var(--primary);
      font-weight: 700;
      font-size: 11.5px;
      opacity: 0.9;
    }

    .zc-actions-right {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }

    .zc-icon-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 30px;
      height: 30px;
      border-radius: 10px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      transition: all 0.16s var(--ease);
    }

    .zc-icon-btn:hover {
      background: var(--bg-subtle);
      color: var(--text-main);
    }

    .zc-icon-btn:active {
      transform: scale(0.94);
    }

    /* Banner de progresso de sequência (RF04) */
    .zc-progress {
      display: none;
      align-items: center;
      gap: 8px;
      background: #0f766e;
      color: #ffffff;
      font-size: 12px;
      font-weight: 600;
      padding: 4px 12px;
      border-radius: 999px;
      box-shadow: 0 2px 8px rgba(15, 118, 110, 0.25);
    }
    .zc-progress.active {
      display: inline-flex;
    }
    .zc-cancel-btn {
      background: rgba(255, 255, 255, 0.2);
      border: none;
      color: #ffffff;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 600;
      cursor: pointer;
      transition: background 0.15s;
    }
    .zc-cancel-btn:hover {
      background: rgba(255, 255, 255, 0.32);
    }

    /* Menus Flutuantes acima da barra (/comando e +N) */
    .zc-popover {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 16px;
      margin-bottom: 8px;
      width: 350px;
      max-height: 260px;
      overflow-y: auto;
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 16px;
      box-shadow: var(--shadow-pop);
      padding: 8px;
      box-sizing: border-box;
      animation: slashPopIn 0.18s var(--ease);
      z-index: 120;
    }

    .zc-popover.open {
      display: block;
    }

    .zc-more-popover {
      width: 320px;
    }

    @keyframes slashPopIn {
      from {
        opacity: 0;
        transform: translateY(6px) scale(0.98);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .zc-popover-header {
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      padding: 4px 10px 8px;
      border-bottom: 1px solid var(--border-subtle);
      margin-bottom: 6px;
      display: flex;
      justify-content: space-between;
    }

    .zc-slash-item {
      display: flex;
      flex-direction: column;
      gap: 3px;
      padding: 8px 11px;
      border-radius: 10px;
      cursor: pointer;
      transition: background 0.14s var(--ease);
    }

    .zc-slash-item:hover {
      background: var(--bg-subtle);
    }

    .zc-slash-item.selected {
      background: var(--primary-soft);
    }

    .zc-slash-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .zc-slash-title {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-weight: 600;
      color: var(--text-main);
    }

    .zc-slash-preview {
      font-size: 12px;
      color: var(--text-muted);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .zc-empty {
      padding: 14px;
      text-align: center;
      font-size: 12.5px;
      color: var(--text-muted);
    }
  `;

  function isDarkMode() {
    return document.body?.classList.contains('dark') ||
      document.documentElement?.getAttribute('data-theme') === 'dark';
  }

  function syncTheme() {
    if (!hostEl) return;
    const theme = isDarkMode() ? 'dark' : 'light';
    if (hostEl.getAttribute('data-theme') !== theme) {
      hostEl.setAttribute('data-theme', theme);
    }
  }

  async function loadData() {
    const state = await CopilotStorage.getAll();
    allShortcuts = state.shortcuts || [];
    showQuickBar = state.settings?.showQuickBar !== false;
  }

  function getBlockIconHtml(shortcut) {
    if (!shortcut.blocks || shortcut.blocks.length === 0) {
      return `<span class="zc-chip-icon">${ICONS.zap}</span>`;
    }
    if (shortcut.blocks.length > 1) {
      return `<span class="zc-chip-icon">${ICONS.layers}<span>${shortcut.blocks.length}x</span></span>`;
    }
    const type = shortcut.blocks[0].type;
    if (type === 'audio') return `<span class="zc-chip-icon">${ICONS.mic}</span>`;
    if (type === 'image') return `<span class="zc-chip-icon">${ICONS.image}</span>`;
    if (type === 'document') return `<span class="zc-chip-icon">${ICONS.doc}</span>`;
    return `<span class="zc-chip-icon">${ICONS.zap}</span>`;
  }

  function getShortcutPreview(shortcut) {
    const first = shortcut.blocks?.[0];
    if (!first) return '';
    if (first.type === 'text') return first.content;
    return `[${first.type.toUpperCase()}] ${first.fileName || 'Mídia anexada'}`;
  }

  function getQuickList() {
    const favorites = allShortcuts.filter(s => s.favorite);
    return favorites.length > 0 ? favorites : allShortcuts;
  }

  function renderMoreMenu(hiddenShortcuts, anchorBtn = null) {
    if (!shadowRoot) return;
    const popover = shadowRoot.querySelector('.zc-more-popover');
    const listEl = shadowRoot.querySelector('.zc-more-list');
    if (!popover || !listEl) return;

    if (!moreMenuOpen || hiddenShortcuts.length === 0) {
      moreMenuOpen = false;
      popover.classList.remove('open');
      return;
    }

    popover.classList.add('open');
    listEl.innerHTML = '';

    hiddenShortcuts.forEach(sc => {
      const item = document.createElement('div');
      item.className = 'zc-slash-item';
      item.title = 'Clique para enviar agora • Shift+Clique para apenas colar no texto';
      item.innerHTML = `
        <div class="zc-slash-top">
          <span class="zc-slash-title">${getBlockIconHtml(sc)} <span>${escapeHtml(sc.title)}</span></span>
          <span class="zc-chip-cmd">/${escapeHtml(sc.command)}</span>
        </div>
        <div class="zc-slash-preview">${escapeHtml(getShortcutPreview(sc))}</div>
      `;
      item.addEventListener('click', (e) => {
        closeMoreMenu();
        SequenceRunner.run(sc, { insertOnly: e.shiftKey });
      });
      listEl.appendChild(item);
    });

    if (anchorBtn && hostEl) {
      const hostRect = hostEl.getBoundingClientRect();
      const btnRect = anchorBtn.getBoundingClientRect();
      const popWidth = popover.offsetWidth || 320;
      const desiredLeft = btnRect.left - hostRect.left;
      const maxLeft = Math.max(12, hostRect.width - popWidth - 14);
      popover.style.left = `${Math.min(Math.max(12, desiredLeft), maxLeft)}px`;
    }
  }

  function closeMoreMenu() {
    if (!moreMenuOpen) return;
    moreMenuOpen = false;
    if (shadowRoot) {
      shadowRoot.querySelector('.zc-more-popover')?.classList.remove('open');
      shadowRoot.querySelector('.zc-more-chip')?.classList.remove('active');
    }
  }

  function renderQuickChips() {
    if (!shadowRoot) return;
    const bar = shadowRoot.querySelector('.zc-bar');
    const container = shadowRoot.querySelector('.zc-chips-scroll');
    if (!bar || !container) return;

    bar.classList.toggle('hidden', !showQuickBar);

    const listToRender = getQuickList();
    const visibleShortcuts = listToRender.slice(0, MAX_VISIBLE_SHORTCUTS);
    const hiddenShortcuts = listToRender.slice(MAX_VISIBLE_SHORTCUTS);

    container.innerHTML = '';

    if (listToRender.length === 0) {
      closeMoreMenu();
      container.innerHTML = `<span style="font-size:12px;color:var(--text-muted);">Nenhum atalho cadastrado. Digite <b>/</b> ou clique em ajustes ao lado.</span>`;
      return;
    }

    visibleShortcuts.forEach(sc => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zc-chip';
      btn.title = `Clique para enviar agora • Shift+Clique para apenas colar no texto`;
      btn.innerHTML = `
        ${getBlockIconHtml(sc)}
        <span>${escapeHtml(sc.title)}</span>
        <span class="zc-chip-cmd">/${escapeHtml(sc.command)}</span>
      `;
      btn.addEventListener('click', (e) => {
        closeMoreMenu();
        SequenceRunner.run(sc, { insertOnly: e.shiftKey });
      });
      container.appendChild(btn);
    });

    if (hiddenShortcuts.length > 0) {
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = `zc-chip zc-more-chip ${moreMenuOpen ? 'active' : ''}`;
      moreBtn.title = `Ver mais ${hiddenShortcuts.length} atalho(s)`;
      moreBtn.textContent = `+${hiddenShortcuts.length}`;
      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeSlashMenu();
        moreMenuOpen = !moreMenuOpen;
        moreBtn.classList.toggle('active', moreMenuOpen);
        renderMoreMenu(hiddenShortcuts, moreBtn);
      });
      container.appendChild(moreBtn);
      if (moreMenuOpen) {
        renderMoreMenu(hiddenShortcuts, moreBtn);
      }
    } else {
      closeMoreMenu();
    }
  }

  function renderSlashMenu() {
    if (!shadowRoot) return;
    const popover = shadowRoot.querySelector('.zc-slash-popover');
    const listEl = shadowRoot.querySelector('.zc-slash-list');
    if (!popover || !listEl) return;

    if (!slashMenuOpen) {
      popover.classList.remove('open');
      return;
    }

    const term = slashFilter.toLowerCase();
    filteredShortcuts = allShortcuts.filter(sc =>
      sc.command.toLowerCase().includes(term) ||
      sc.title.toLowerCase().includes(term) ||
      getShortcutPreview(sc).toLowerCase().includes(term)
    );

    if (selectedIndex >= filteredShortcuts.length) {
      selectedIndex = 0;
    }

    popover.classList.add('open');
    listEl.innerHTML = '';

    if (filteredShortcuts.length === 0) {
      listEl.innerHTML = `<div class="zc-empty">Nenhum atalho encontrado para "/${escapeHtml(slashFilter)}"</div>`;
      return;
    }

    filteredShortcuts.forEach((sc, idx) => {
      const item = document.createElement('div');
      item.className = `zc-slash-item ${idx === selectedIndex ? 'selected' : ''}`;
      item.innerHTML = `
        <div class="zc-slash-top">
          <span class="zc-slash-title">${getBlockIconHtml(sc)} <span>${escapeHtml(sc.title)}</span></span>
          <span class="zc-chip-cmd">/${escapeHtml(sc.command)}</span>
        </div>
        <div class="zc-slash-preview">${escapeHtml(getShortcutPreview(sc))}</div>
      `;
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        executeSlashSelection(sc, { insertOnly: e.shiftKey });
      });
      listEl.appendChild(item);
    });
  }

  async function clearMessageInput(input) {
    if (!input) return;
    input.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(input);
    selection.removeAllRanges();
    selection.addRange(range);

    input.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'deleteContentBackward'
    }));
    document.execCommand('delete', false, null);

    closeSlashMenu();
    await new Promise(r => setTimeout(r, 40));
  }

  async function executeSlashSelection(shortcut, { insertOnly = false } = {}) {
    closeSlashMenu();
    const input = Selectors.getMessageInput();
    await clearMessageInput(input);
    await SequenceRunner.run(shortcut, { insertOnly });
  }

  function closeSlashMenu() {
    slashMenuOpen = false;
    slashFilter = '';
    selectedIndex = 0;
    renderSlashMenu();
  }

  function attachInputListeners() {
    const input = Selectors.getMessageInput();
    if (!input || input.dataset.zcSlashBound === 'true') return;
    input.dataset.zcSlashBound = 'true';

    const syncSlashState = () => {
      const rawText = (input.textContent || '').replace(/\u200B/g, '').trim();
      if (rawText.startsWith('/') && !rawText.includes(' ') && rawText.length > 0) {
        closeMoreMenu();
        slashMenuOpen = true;
        slashFilter = rawText.slice(1);
        selectedIndex = 0;
        renderSlashMenu();
      } else if (slashMenuOpen) {
        closeSlashMenu();
      }
    };

    input.addEventListener('input', syncSlashState);
    input.addEventListener('keyup', (e) => {
      if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) return;
      syncSlashState();
    });

    input.addEventListener('blur', () => {
      setTimeout(() => closeSlashMenu(), 150);
    });

    if (!document.body.dataset.zcGlobalKeyBound) {
      document.body.dataset.zcGlobalKeyBound = 'true';

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && moreMenuOpen) {
          e.preventDefault();
          closeMoreMenu();
          return;
        }

        if (!slashMenuOpen) return;
        const activeInput = Selectors.getMessageInput();
        if (!activeInput || !activeInput.contains(document.activeElement)) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (filteredShortcuts.length > 0) {
            selectedIndex = (selectedIndex + 1) % filteredShortcuts.length;
            renderSlashMenu();
          }
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopImmediatePropagation();
          if (filteredShortcuts.length > 0) {
            selectedIndex = (selectedIndex - 1 + filteredShortcuts.length) % filteredShortcuts.length;
            renderSlashMenu();
          }
        } else if (e.key === 'Enter' || e.key === 'Tab') {
          if (filteredShortcuts[selectedIndex]) {
            e.preventDefault();
            e.stopImmediatePropagation();
            executeSlashSelection(filteredShortcuts[selectedIndex], { insertOnly: e.shiftKey });
          }
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopImmediatePropagation();
          closeSlashMenu();
        }
      }, true);
    }
  }

  async function mount() {
    if (isMounting) return;

    const footer = Selectors.getChatFooter();
    if (!footer) return;

    const existingHost = footer.querySelector('#zap-copilot-quickbar-host');
    if (existingHost) {
      syncTheme();
      attachInputListeners();
      return;
    }

    isMounting = true;
    try {
      document.querySelectorAll('#zap-copilot-quickbar-host').forEach(el => el.remove());

      await loadData();

      if (footer.querySelector('#zap-copilot-quickbar-host')) {
        attachInputListeners();
        return;
      }

      hostEl = document.createElement('div');
      hostEl.id = 'zap-copilot-quickbar-host';
      shadowRoot = hostEl.attachShadow({ mode: 'open' });

      shadowRoot.innerHTML = `
        <style>${STYLES}</style>
        <div class="zc-popover zc-slash-popover">
          <div class="zc-popover-header">
            <span>Atalhos Rápidos</span>
            <span>Enter: enviar • Shift+Enter: colar</span>
          </div>
          <div class="zc-slash-list"></div>
        </div>
        <div class="zc-popover zc-more-popover">
          <div class="zc-popover-header">
            <span>Mais Atalhos</span>
            <span>Clique: enviar • Shift: colar</span>
          </div>
          <div class="zc-more-list"></div>
        </div>
        <div class="zc-bar">
          <div class="zc-chips-scroll"></div>
          <div class="zc-actions-right">
            <div class="zc-progress">
              <span class="zc-progress-text">Enviando 1/3...</span>
              <button type="button" class="zc-cancel-btn">Cancelar</button>
            </div>
            <button type="button" class="zc-icon-btn" id="zc-open-settings" title="Gerenciar Atalhos" aria-label="Gerenciar Atalhos">${ICONS.sliders}</button>
          </div>
        </div>
      `;

      shadowRoot.querySelector('.zc-cancel-btn').addEventListener('click', () => {
        SequenceRunner.cancel();
      });

      shadowRoot.querySelector('#zc-open-settings').addEventListener('click', () => {
        closeMoreMenu();
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      });

      footer.prepend(hostEl);
      syncTheme();

      renderQuickChips();
      attachInputListeners();
    } finally {
      isMounting = false;
    }
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&')
      .replace(/</g, '<')
      .replace(/>/g, '>')
      .replace(/"/g, '"');
  }

  SequenceRunner.onProgress((state) => {
    if (!shadowRoot) return;
    const progressEl = shadowRoot.querySelector('.zc-progress');
    const textEl = shadowRoot.querySelector('.zc-progress-text');
    if (!progressEl || !textEl) return;

    if (state.status === 'sending') {
      progressEl.classList.add('active');
      textEl.textContent = `Enviando ${state.current}/${state.total}...`;
    } else {
      progressEl.classList.remove('active');
    }
  });

  chrome.storage.onChanged.addListener(async (changes) => {
    if (changes.shortcuts || changes.settings) {
      await loadData();
      renderQuickChips();
      if (slashMenuOpen) renderSlashMenu();
    }
  });

  document.addEventListener('click', (e) => {
    if (moreMenuOpen && hostEl && !hostEl.contains(e.target)) {
      closeMoreMenu();
    }
  });

  function init() {
    const themeObserver = new MutationObserver(() => syncTheme());
    if (document.body) {
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    DomObserver.on('chatChanged', () => {
      closeSlashMenu();
      closeMoreMenu();
      mount();
    });
    DomObserver.on('domUpdated', () => {
      mount();
    });
  }

  return { init, mount };
})();