window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.TagsBarUI = (() => {
  const { Selectors, Storage: CopilotStorage, DomObserver } = window.ZapCopilot;

  const MAX_VISIBLE_TAGS = 2; // Quantas etiquetas ficam visíveis na barra antes do "+N"
  let hostEl = null;
  let shadowRoot = null;
  let activeFilter = null; // null | 'followup' | tagId
  let overflowOpen = false;
  let isMounting = false;

  const STYLES = `
    :host {
      display: block;
      width: 100%;
      position: relative;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    .zc-tags-row {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 16px 8px;
      background: #ffffff;
      flex-wrap: nowrap;
    }
    .zc-filter-pill {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 28px;
      padding: 0 11px;
      border-radius: 999px;
      border: 1px solid #e9edef;
      background: #f0f2f5;
      color: #54656f;
      font-size: 12.5px;
      font-weight: 500;
      white-space: nowrap;
      cursor: pointer;
      transition: all 0.15s;
      flex-shrink: 0;
    }
    .zc-filter-pill:hover {
      background: #e9edef;
      color: #111b21;
    }
    .zc-filter-pill.active {
      background: #d9fdd3;
      border-color: #25d366;
      color: #008069;
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
      min-width: 190px;
      max-width: 240px;
      max-height: 260px;
      overflow-y: auto;
      background: #ffffff;
      border: 1px solid #e9edef;
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(11, 20, 26, 0.16);
      padding: 6px;
      z-index: 950;
    }
    .zc-overflow-menu.open {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .zc-overflow-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 8px;
      border: none;
      background: transparent;
      color: #111b21;
      font-size: 13px;
      cursor: pointer;
      text-align: left;
      width: 100%;
    }
    .zc-overflow-item:hover {
      background: #f0f2f5;
    }
    .zc-overflow-item.active {
      background: #d9fdd3;
      color: #008069;
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
      background: #ffffff;
      border-top: 1px solid #e9edef;
      border-bottom: 1px solid #d1d7db;
      box-shadow: 0 10px 24px rgba(11, 20, 26, 0.16);
      z-index: 900;
      padding: 8px;
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
      color: #008069;
      border-bottom: 1px solid #f0f2f5;
    }
    .zc-close-filter {
      background: none;
      border: none;
      color: #54656f;
      cursor: pointer;
      font-size: 12px;
    }
    .zc-chat-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 10px;
      border-radius: 8px;
      cursor: pointer;
      font-size: 13.5px;
      color: #111b21;
    }
    .zc-chat-row:hover {
      background: #f0f2f5;
    }
  `;

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

    // 1. Pill "Aguardando Retorno"
    const pendingCount = state.followups.filter(f => !f.completed).length;
    const fuPill = document.createElement('button');
    fuPill.type = 'button';
    fuPill.className = `zc-filter-pill ${activeFilter === 'followup' ? 'active' : ''}`;
    fuPill.innerHTML = `<span>🕒 Retorno</span>${pendingCount > 0 ? `<b>(${pendingCount})</b>` : ''}`;
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
          ${count > 0 ? `<b style="font-size:11.5px;color:#54656f;">(${count})</b>` : ''}
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
      listEl.innerHTML = `<div style="padding:14px;text-align:center;font-size:12.5px;color:#667781;">Nenhuma conversa marcada neste filtro ainda.</div>`;
      return;
    }

    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'zc-chat-row';
      div.innerHTML = `
        <div>
          <div style="font-weight:600;">${item.contactKey}</div>
          <div style="font-size:11.5px;color:#667781;">${item.sub}</div>
        </div>
        <span style="font-size:12px;color:#008069;">Abrir →</span>
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
            <button type="button" class="zc-close-filter">Fechar ✕</button>
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
    DomObserver.on('appReady', () => mount());
    DomObserver.on('domUpdated', () => mount());
  }

  return { init };
})();