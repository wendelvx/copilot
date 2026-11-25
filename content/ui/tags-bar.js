window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.TagsBar = (() => {
  const { Selectors, Storage } = window.ZapCopilot;

  const MAX_VISIBLE_CUSTOM_TAGS = 2; // Quantas etiquetas ficam visíveis direto na barra antes do "+N"
  let activeFilter = null; // null | 'FOLLOWUP' | tagId
  let overflowOpen = false;

  function ensureStyles() {
    if (document.getElementById('zc-tags-styles')) return;
    const style = document.createElement('style');
    style.id = 'zc-tags-styles';
    style.textContent = `
      .zc-filter-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        height: 32px;
        padding: 0 12px;
        border-radius: 9999px;
        border: 1px solid rgba(134, 150, 160, 0.25);
        background: transparent;
        color: #8696a0;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        flex-shrink: 0;
        transition: background 0.15s, color 0.15s, border-color 0.15s;
      }
      .zc-filter-pill:hover {
        background: rgba(134, 150, 160, 0.12);
      }
      .zc-filter-pill.active {
        background: rgba(0, 168, 132, 0.18);
        border-color: #00a884;
        color: #00a884;
      }
      .zc-tag-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .zc-more-btn {
        font-weight: 600;
        padding: 0 10px;
      }
      .zc-overflow-popover {
        position: fixed;
        z-index: 99999;
        background: #233138;
        border: 1px solid rgba(134, 150, 160, 0.25);
        border-radius: 12px;
        padding: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 190px;
        max-width: 260px;
        max-height: 280px;
        overflow-y: auto;
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
        color: #e9edef;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        width: 100%;
      }
      .zc-overflow-item:hover {
        background: rgba(134, 150, 160, 0.15);
      }
      .zc-overflow-item.active {
        background: rgba(0, 168, 132, 0.2);
        color: #00a884;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  function closeOverflowPopover() {
    overflowOpen = false;
    const existing = document.getElementById('zc-tags-overflow-popover');
    if (existing) existing.remove();
  }

  function openOverflowPopover(anchorBtn, hiddenTags, countsByTag) {
    closeOverflowPopover();
    overflowOpen = true;

    const popover = document.createElement('div');
    popover.id = 'zc-tags-overflow-popover';
    popover.className = 'zc-overflow-popover';

    hiddenTags.forEach(tag => {
      const count = countsByTag[tag.id] || 0;
      const item = document.createElement('button');
      item.type = 'button';
      item.className = `zc-overflow-item ${activeFilter === tag.id ? 'active' : ''}`;
      item.innerHTML = `
        <span style="display:flex;align-items:center;gap:8px;overflow:hidden;">
          <span class="zc-tag-dot" style="background:${tag.color};"></span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${tag.label}</span>
        </span>
        ${count > 0 ? `<span style="font-size:11px;opacity:0.8;">${count}</span>` : ''}
      `;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        activeFilter = activeFilter === tag.id ? null : tag.id;
        closeOverflowPopover();
        applyChatListFilter();
        renderFilterBar();
      });
      popover.appendChild(item);
    });

    document.body.appendChild(popover);

    const rect = anchorBtn.getBoundingClientRect();
    const left = Math.min(rect.left, window.innerWidth - popover.offsetWidth - 12);
    popover.style.top = `${rect.bottom + 6}px`;
    popover.style.left = `${Math.max(8, left)}px`;
  }

  async function applyChatListFilter() {
    const rows = Selectors.getVisibleChatRows();
    if (!activeFilter) {
      rows.forEach(row => { row.style.display = ''; });
      return;
    }

    const { followups, chatTags } = await Storage.getAll();
    const activeFollowupContacts = new Set(
      followups.filter(f => !f.completed).map(f => f.contactKey)
    );

    rows.forEach(row => {
      const contactKey = Selectors.getRowContactKey(row);
      if (!contactKey) return;

      let match = false;
      if (activeFilter === 'FOLLOWUP') {
        match = activeFollowupContacts.has(contactKey);
      } else {
        const tags = chatTags[contactKey] || [];
        match = tags.includes(activeFilter);
      }
      row.style.display = match ? '' : 'none';
    });
  }

  function createPill({ id, label, color = null, count = 0, isMore = false }) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `zc-filter-pill ${activeFilter === id ? 'active' : ''} ${isMore ? 'zc-more-btn' : ''}`;
    btn.dataset.zcFilter = id;

    btn.innerHTML = `
      ${color ? `<span class="zc-tag-dot" style="background:${color};"></span>` : ''}
      <span>${label}</span>
      ${count > 0 ? `<span style="font-size:11px;opacity:0.85;">(${count})</span>` : ''}
    `;
    return btn;
  }

  async function renderFilterBar() {
    ensureStyles();
    const filtersRow = Selectors.getFiltersRow();
    if (!filtersRow) return;

    // Remove pílulas antigas injetadas pela extensão antes de re-renderizar
    filtersRow.querySelectorAll('[data-zc-filter]').forEach(el => el.remove());

    // Reseta filtro se o usuário clicar nas abas nativas do WhatsApp ("Todas", "Não lidas", etc.)
    filtersRow.querySelectorAll('button:not([data-zc-filter])').forEach(nativeBtn => {
      if (!nativeBtn.dataset.zcHooked) {
        nativeBtn.dataset.zcHooked = '1';
        nativeBtn.addEventListener('click', () => {
          activeFilter = null;
          closeOverflowPopover();
          applyChatListFilter();
          renderFilterBar();
        });
      }
    });

    const { customTags, chatTags, followups } = await Storage.getAll();
    const activeFollowupsCount = followups.filter(f => !f.completed).length;

    const countsByTag = {};
    Object.values(chatTags).forEach(tagList => {
      (tagList || []).forEach(tid => {
        countsByTag[tid] = (countsByTag[tid] || 0) + 1;
      });
    });

    // 1. Pílula fixa: Aguardando Retorno
    const followupPill = createPill({
      id: 'FOLLOWUP',
      label: 'Aguardando Retorno',
      color: '#f59e0b',
      count: activeFollowupsCount
    });
    followupPill.addEventListener('click', () => {
      activeFilter = activeFilter === 'FOLLOWUP' ? null : 'FOLLOWUP';
      closeOverflowPopover();
      applyChatListFilter();
      renderFilterBar();
    });
    filtersRow.appendChild(followupPill);

    // 2. Primeiras etiquetas visíveis diretamente na barra
    const visibleTags = customTags.slice(0, MAX_VISIBLE_CUSTOM_TAGS);
    const hiddenTags = customTags.slice(MAX_VISIBLE_CUSTOM_TAGS);

    visibleTags.forEach(tag => {
      const pill = createPill({
        id: tag.id,
        label: tag.label,
        color: tag.color,
        count: countsByTag[tag.id] || 0
      });
      pill.addEventListener('click', () => {
        activeFilter = activeFilter === tag.id ? null : tag.id;
        closeOverflowPopover();
        applyChatListFilter();
        renderFilterBar();
      });
      filtersRow.appendChild(pill);
    });

    // 3. Botão "+N" quando existem mais etiquetas além do limite visível
    if (hiddenTags.length > 0) {
      const activeHiddenTag = hiddenTags.find(t => t.id === activeFilter);
      const moreBtn = createPill({
        id: 'MORE_TAGS',
        label: activeHiddenTag ? `+${hiddenTags.length} (${activeHiddenTag.label})` : `+${hiddenTags.length}`,
        color: activeHiddenTag ? activeHiddenTag.color : null,
        isMore: true
      });
      if (activeHiddenTag) moreBtn.classList.add('active');

      moreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (overflowOpen) {
          closeOverflowPopover();
        } else {
          openOverflowPopover(moreBtn, hiddenTags, countsByTag);
        }
      });
      filtersRow.appendChild(moreBtn);
    }
  }

  // Fecha o popover ao clicar fora
  document.addEventListener('click', (e) => {
    if (overflowOpen && !e.target.closest('#zc-tags-overflow-popover') && !e.target.closest('[data-zc-filter="MORE_TAGS"]')) {
      closeOverflowPopover();
    }
  });

  // Atualiza automaticamente quando etiquetas forem criadas/excluídas no popup ou aplicadas em chats
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && (changes.customTags || changes.chatTags || changes.followups)) {
      renderFilterBar();
      applyChatListFilter();
    }
  });

  function init() {
    renderFilterBar();
  }

  return { init, renderFilterBar, applyChatListFilter };
})();