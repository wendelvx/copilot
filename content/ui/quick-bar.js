window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.QuickBarUI = (() => {
  const { Selectors, Storage: CopilotStorage, SequenceRunner, DomObserver } = window.ZapCopilot;

  let hostEl = null;
  let shadowRoot = null;
  let slashMenuOpen = false;
  let slashFilter = '';
  let selectedIndex = 0;
  let filteredShortcuts = [];
  let allShortcuts = [];
  let showQuickBar = true;
  let isMounting = false;

  const STYLES = `
    :host {
      display: block;
      width: 100%;
      position: relative;
      z-index: 100;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    /* Barra de Acesso Rápido Visual (RF02) */
    .zc-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 14px;
      background: rgba(240, 242, 245, 0.92);
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
      backdrop-filter: blur(6px);
      box-sizing: border-box;
    }

    .zc-bar.hidden {
      display: none;
    }

    .zc-chips-scroll {
      display: flex;
      align-items: center;
      gap: 6px;
      overflow-x: auto;
      scrollbar-width: none;
      flex: 1;
    }
    .zc-chips-scroll::-webkit-scrollbar {
      display: none;
    }

    .zc-chip {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 10px;
      border-radius: 999px;
      border: 1px solid #d1d7db;
      background: #ffffff;
      color: #111b21;
      font-size: 12.5px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s ease;
      user-select: none;
    }

    .zc-chip:hover {
      background: #e7fce3;
      border-color: #25d366;
      color: #008069;
    }

    .zc-chip-cmd {
      color: #008069;
      font-weight: 700;
      font-size: 11.5px;
    }

    .zc-chip-badge {
      font-size: 10px;
      background: #f0f2f5;
      color: #54656f;
      padding: 1px 5px;
      border-radius: 6px;
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
      width: 26px;
      height: 26px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: #54656f;
      cursor: pointer;
      font-size: 14px;
      transition: background 0.15s;
    }

    .zc-icon-btn:hover {
      background: rgba(0, 0, 0, 0.08);
      color: #111b21;
    }

    /* Banner de progresso de sequência (RF04) */
    .zc-progress {
      display: none;
      align-items: center;
      gap: 8px;
      background: #008069;
      color: #fff;
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 999px;
    }
    .zc-progress.active {
      display: inline-flex;
    }
    .zc-cancel-btn {
      background: rgba(255,255,255,0.2);
      border: none;
      color: #fff;
      border-radius: 999px;
      padding: 1px 7px;
      font-size: 11px;
      cursor: pointer;
    }
    .zc-cancel-btn:hover {
      background: rgba(255,255,255,0.35);
    }

    /* Menu Flutuante do Comando / (RF01) */
    .zc-slash-popover {
      display: none;
      position: absolute;
      bottom: 100%;
      left: 16px;
      margin-bottom: 6px;
      width: 340px;
      max-height: 240px;
      overflow-y: auto;
      background: #ffffff;
      border: 1px solid #d1d7db;
      border-radius: 12px;
      box-shadow: 0 6px 24px rgba(11, 20, 26, 0.16);
      padding: 6px;
      box-sizing: border-box;
    }

    .zc-slash-popover.open {
      display: block;
    }

    .zc-slash-header {
      font-size: 11px;
      font-weight: 600;
      color: #667781;
      padding: 4px 8px 6px;
      border-bottom: 1px solid #f0f2f5;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }

    .zc-slash-item {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 7px 10px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.1s;
    }

    .zc-slash-item:hover,
    .zc-slash-item.selected {
      background: #f0f2f5;
    }

    .zc-slash-item.selected {
      background: #e7fce3;
    }

    .zc-slash-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 6px;
    }

    .zc-slash-title {
      font-size: 13px;
      font-weight: 600;
      color: #111b21;
    }

    .zc-slash-preview {
      font-size: 12px;
      color: #667781;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .zc-empty {
      padding: 12px;
      text-align: center;
      font-size: 12.5px;
      color: #667781;
    }
  `;

  async function loadData() {
    const state = await CopilotStorage.getAll();
    allShortcuts = state.shortcuts || [];
    showQuickBar = state.settings?.showQuickBar !== false;
  }

  function getBlockIcon(shortcut) {
    if (!shortcut.blocks || shortcut.blocks.length === 0) return '⚡';
    if (shortcut.blocks.length > 1) return `📑 ${shortcut.blocks.length}x`;
    const type = shortcut.blocks[0].type;
    if (type === 'audio') return '🎙️';
    if (type === 'image') return '🖼️';
    if (type === 'document') return '📄';
    return '⚡';
  }

  function getShortcutPreview(shortcut) {
    const first = shortcut.blocks?.[0];
    if (!first) return '';
    if (first.type === 'text') return first.content;
    return `[${first.type.toUpperCase()}] ${first.fileName || 'Mídia anexada'}`;
  }

  function renderQuickChips() {
    if (!shadowRoot) return;
    const bar = shadowRoot.querySelector('.zc-bar');
    const container = shadowRoot.querySelector('.zc-chips-scroll');
    if (!bar || !container) return;

    bar.classList.toggle('hidden', !showQuickBar);

    const favorites = allShortcuts.filter(s => s.favorite);
    const listToRender = favorites.length > 0 ? favorites : allShortcuts;

    container.innerHTML = '';

    if (listToRender.length === 0) {
      container.innerHTML = `<span style="font-size:12px;color:#667781;">Nenhum atalho cadastrado. Digite <b>/</b> ou clique na engrenagem.</span>`;
      return;
    }

    listToRender.forEach(sc => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'zc-chip';
      btn.title = `Clique para enviar agora • Shift+Clique para apenas colar no texto`;
      btn.innerHTML = `
        <span>${getBlockIcon(sc)}</span>
        <span>${escapeHtml(sc.title)}</span>
        <span class="zc-chip-cmd">/${escapeHtml(sc.command)}</span>
      `;
      btn.addEventListener('click', (e) => {
        SequenceRunner.run(sc, { insertOnly: e.shiftKey });
      });
      container.appendChild(btn);
    });
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
          <span class="zc-slash-title">${getBlockIcon(sc)} ${escapeHtml(sc.title)}</span>
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
        <div class="zc-slash-popover">
          <div class="zc-slash-header">
            <span>Atalhos Rápidos</span>
            <span>Enter: enviar • Shift+Enter: colar</span>
          </div>
          <div class="zc-slash-list"></div>
        </div>
        <div class="zc-bar">
          <div class="zc-chips-scroll"></div>
          <div class="zc-actions-right">
            <div class="zc-progress">
              <span class="zc-progress-text">Enviando 1/3...</span>
              <button type="button" class="zc-cancel-btn">Cancelar</button>
            </div>
            <button type="button" class="zc-icon-btn" id="zc-open-settings" title="Gerenciar Atalhos">⚙️</button>
          </div>
        </div>
      `;

      shadowRoot.querySelector('.zc-cancel-btn').addEventListener('click', () => {
        SequenceRunner.cancel();
      });

      shadowRoot.querySelector('#zc-open-settings').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'OPEN_POPUP' });
      });

      footer.prepend(hostEl);

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

  function init() {
    DomObserver.on('chatChanged', () => {
      closeSlashMenu();
      mount();
    });
    DomObserver.on('domUpdated', () => {
      mount();
    });
  }

  return { init, mount };
})();