window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.TagsBarUI = (() => {
  const { Selectors, Storage: CopilotStorage, DomObserver } = window.ZapCopilot;

  const MAX_VISIBLE_TAGS = 2; // Quantas etiquetas ficam visíveis na barra antes do "+N"
  let hostEl = null;
  let shadowRoot = null;
  let activeFilter = null; // null | 'followup' | tagId
  let overflowOpen = false;
  let isMounting = false;

  const ICONS = {
    clock: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`,
    close: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
  };

  const STYLES = `
    :host {
      --bg-surface: #ffffff;
      --bg-canvas: #faf9f6;
      --bg-subtle: #f3f2ee;
      --bg-hover: #eae8e1;
      --primary: #0f766e;
      --primary-soft: #e6f4f1;
      --primary-border: rgba(15, 118, 110, 0.25);
      --text-main: #1e293b;
      --text-muted: #64748b;
      --border-subtle: rgba(30, 41, 59, 0.08);
      --shadow-pop: 0 10px 28px -4px rgba(15, 23, 42, 0.14);
      --ease: cubic-bezier(0.16, 1, 0.3, 1);

      display: block;
      width: 100%;
      position: relative;
      font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }

    :host([data-theme="dark"]) {
      --bg-surface: #111b21;
      --bg-canvas: #202c33;
      --bg-subtle: #202c33;
      --bg-hover: #2a3942;
      --primary: #2dd4bf;
      --primary-soft: rgba(45, 212, 191, 0.14);
      --primary-border: rgba(45, 212, 191, 0.3);
      --text-main: #e9edef;
      --text-muted: #8696a0;
      --border-subtle: rgba(134, 150, 160, 0.16);
      --shadow-pop: 0 12px 32px rgba(0, 0, 0, 0.45);
    }

    .zc-tags-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 16px 8px;
      background: var(--bg-surface);
      flex-wrap: nowrap;
    }

    .zc-filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 28px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid var(--border-subtle);
      background: var(--bg-subtle);
      color: var(--text-muted);
      font-size: 12px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.16s var(--ease);
      flex-shrink: 0;
    }

    .zc-filter-pill:hover {
      background: var(--bg-hover);
      color: var(--text-main);
    }

    .zc-filter-pill:active {
      transform: scale(0.96);
    }

    .zc-filter-pill.active {
      background: var(--primary-soft);
      border-color: var(--primary-border);
      color: var(--primary);
      font-weight: 600;
    }

    .zc-more-pill {
      font-weight: 600;
      padding: 0 10px;
    }

    .zc-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .zc-overflow-menu {
      display: none;
      position: absolute;
      top: calc(100% - 2px);
      right: 16px;
      min-width: 195px;
      max-width: 245px;
      max-height: 260px;
      overflow-y: auto;
      background: var(--bg-canvas);
      border: 1px solid var(--border-subtle);
      border-radius: 14px;
      box-shadow: var(--shadow-pop);
      padding: 6px;
      z-index: 950;
      animation: fadeDrop 0.16s var(--ease);
    }

    .zc-overflow-menu.open {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    @keyframes fadeDrop {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .zc-overflow-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 10px;
      border: none;
      background: transparent;
      color: var(--text-main);
      font-size: 12.5px;
      cursor: pointer;
      text-align: left;
      width: 100%;
      transition: background 0.14s;
    }

    .zc-overflow-item:hover {
      background: var(--bg-hover);
    }

    .zc-overflow-item.active {
      background: var(--primary-soft);
      color: var(--primary);
      font-weight: 600;
    }

    .zc-results-drawer {
      display: none;
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      max-height: 360px;
      overflow-y: auto;
      background: var(--bg-canvas);
      border-top: 1px solid var(--border-subtle);
      border-bottom: 1px solid var(--border-subtle);
      box-shadow: var(--shadow-pop);
      z-index: 900;
      padding: 10px;
    }

    .zc-results-drawer.open {
      display: block;
    }

    .zc-drawer-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 8px 8px;
      font-size: 12px;
      font-weight: 700;
      color: var(--primary);
      border-bottom: 1px solid var(--border-subtle);
    }

    .zc-close-filter {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: none;
      border: none;
      color: var(--text-muted);
      cursor: pointer;
      font-size: 12px;
      padding: 3px 6px;
      border-radius: 6px;
      transition: background 0.14s, color 0.14s;
    }

    .zc-close-filter:hover {
      background: var(--bg-hover);
      color: var(--text-main);
    }

    .zc-chat-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 10px;
      border-radius: 10px;
      cursor: pointer;
      font-size: 13px;
      color: var(--text-main);
      transition: background 0.14s;
    }

    .zc-chat-row:hover {
      background: var(--bg-hover);
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

  async function render() {
    if (!shadowRoot) return;
    const state = await CopilotStorage.getAll();
    const rowEl = shadowRoot.querySelector('.zc-tags-row');
    const overflowEl = shadowRoot.querySelector('.zc-overflow-menu');
    const drawerEl = shadowRoot.querySelector('.zc-results-drawer');
    const listEl = shadowRoot.querySelector('#zc-filtered-chats');
    const titleEl = shadowRoot.querySelector('#zc-drawer-title');

    rowEl.innerHTML = '';
    overflowEl.innerHTML = '';

    // 1. Pill "Retorno"
    const pendingCount = state.followups.filter(f => !f.completed).length;
    const fuPill = document.createElement('button');
    fuPill.type = 'button';
    fuPill.className = `zc-filter-pill ${activeFilter === 'followup' ? 'active' : ''}`;
    fuPill.innerHTML = `${ICONS.clock}<span>Retorno</span>${pendingCount > 0 ? `<b>(${pendingCount})</b>` : ''}`;
    fuPill.addEventListener('click', () => {
      overflowOpen = false;
      activeFilter = activeFilter === 'followup' ? null : 'followup';
      render();
    });
    rowEl.appendChild(fuPill);

    // 2. Divide entre etiquetas visíveis na barra e etiquetas extras no menu "+N"
    const visibleTags = state.customTags.slice(0, MAX_VISIBLE_TAGS);
    const hiddenTags = state.customTags.slice(MAX_VISIBLE_TAGS);

    visibleTags.forEach(tag => {
      const count = Object.values(state.chatTags).filter(arr => arr.includes(tag.id)).length;
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `zc-filter-pill ${activeFilter === tag.id ? 'active' : ''}`;
      pill.innerHTML = `<span class="zc-dot" style="background:${tag.color}"></span><span>${tag.label}</span>${count > 0 ? `<b>(${count})</b>` : ''}`;
      pill.addEventListener('click', () => {
        overflowOpen = false;
        activeFilter = activeFilter === tag.id ? null : tag.id;
        render();
      });
      rowEl.appendChild(pill);
    });

    // 3. Botão "+N" e menu expansível se houver mais etiquetas
    if (hiddenTags.length > 0) {
      const activeHiddenTag = hiddenTags.find(t => t.id === activeFilter);
      const moreBtn = document.createElement('button');
      moreBtn.type = 'button';
      moreBtn.className = `zc-filter-pill zc-more-pill ${activeHiddenTag || overflowOpen ? 'active' : ''}`;
      moreBtn.innerHTML = activeHiddenTag
        ? `<span class="zc-dot" style="background:${activeHiddenTag.color}"></span><span>+${hiddenTags.length} (${activeHiddenTag.label})</span>`
        : `<span>+${hiddenTags.length}</span>`;

      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        overflowOpen = !overflowOpen;
        render();
      });
      rowEl.appendChild(moreBtn);

      hiddenTags.forEach(tag => {
        const count = Object.values(state.chatTags).filter(arr => arr.includes(tag.id)).length;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `zc-overflow-item ${activeFilter === tag.id ? 'active' : ''}`;
        item.innerHTML = `
          <span style="display:flex;align-items:center;gap:8px;overflow:hidden;">
            <span class="zc-dot" style="background:${tag.color}"></span>
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tag.label}</span>
          </span>
          ${count > 0 ? `<b style="font-size:11px;color:var(--text-muted);">(${count})</b>` : ''}
        `;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          overflowOpen = false;
          activeFilter = activeFilter === tag.id ? null : tag.id;
          render();
        });
        overflowEl.appendChild(item);
      });
    } else {
      overflowOpen = false;
    }

    overflowEl.classList.toggle('open', overflowOpen && hiddenTags.length > 0);

    // 4. Drawer com contatos correspondentes ao filtro ativo
    if (!activeFilter) {
      drawerEl.classList.remove('open');
      return;
    }

    drawerEl.classList.add('open');
    listEl.innerHTML = '';

    let items = [];
    if (activeFilter === 'followup') {
      titleEl.textContent = 'Aguardando Retorno';
      items = state.followups
        .filter(f => !f.completed)
        .map(f => ({ contactKey: f.contactKey, sub: f.note || 'Follow-up agendado' }));
    } else {
      const tagObj = state.customTags.find(t => t.id === activeFilter);
      titleEl.textContent = `Etiqueta: ${tagObj?.label || ''}`;
      items = Object.entries(state.chatTags)
        .filter(([, tags]) => tags.includes(activeFilter))
        .map(([contactKey]) => ({ contactKey, sub: 'Clique para abrir a conversa' }));
    }

    if (items.length === 0) {
      listEl.innerHTML = `<div style="padding:14px;text-align:center;font-size:12px;color:var(--text-muted);">Nenhuma conversa marcada neste filtro ainda.</div>`;
      return;
    }

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'zc-chat-row';
      div.innerHTML = `
        <div>
          <div style="font-weight:600;">${item.contactKey}</div>
          <div style="font-size:11.5px;color:var(--text-muted);">${item.sub}</div>
        </div>
        <span style="font-size:12px;font-weight:600;color:var(--primary);">Abrir →</span>
      `;
      div.addEventListener('click', async () => {
        activeFilter = null;
        overflowOpen = false;
        render();
        await Selectors.openChatByContactKey(item.contactKey);
      });
      listEl.appendChild(div);
    });
  }

  async function mount() {
    if (isMounting) return;
    const filtersRow = Selectors.getFiltersRow();
    if (!filtersRow || !filtersRow.parentElement) return;

    if (filtersRow.parentElement.querySelector('#zap-copilot-tagsbar-host')) {
      syncTheme();
      return;
    }

    isMounting = true;
    try {
      hostEl = document.createElement('div');
      hostEl.id = 'zap-copilot-tagsbar-host';
      shadowRoot = hostEl.attachShadow({ mode: 'open' });

      shadowRoot.innerHTML = `
        <style>${STYLES}</style>
        <div class="zc-tags-row"></div>
        <div class="zc-overflow-menu"></div>
        <div class="zc-results-drawer">
          <div class="zc-drawer-head">
            <span id="zc-drawer-title">Filtro</span>
            <button type="button" class="zc-close-filter">${ICONS.close} Fechar</button>
          </div>
          <div id="zc-filtered-chats"></div>
        </div>
      `;

      shadowRoot.querySelector('.zc-close-filter').addEventListener('click', () => {
        activeFilter = null;
        overflowOpen = false;
        render();
      });

      filtersRow.insertAdjacentElement('afterend', hostEl);
      syncTheme();
      await render();
    } finally {
      isMounting = false;
    }
  }

  // Fecha o menu "+N" se o usuário clicar fora do componente
  document.addEventListener('click', (e) => {
    if (overflowOpen && hostEl && !hostEl.contains(e.target)) {
      overflowOpen = false;
      render();
    }
  });

  chrome.storage.onChanged.addListener((changes) => {
    if (changes.followups || changes.customTags || changes.chatTags) {
      render();
    }
  });

  function init() {
    const themeObserver = new MutationObserver(() => syncTheme());
    if (document.body) {
      themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    DomObserver.on('appReady', () => mount());
    DomObserver.on('domUpdated', () => mount());
  }

  return { init };
})();