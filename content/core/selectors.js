window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.Selectors = (() => {
  /**
   * Busca de elementos priorizando atributos de acessibilidade (aria-label, role)
   * e estrutura semântica (header, footer) extraídos do DOM real.
   */
  function getSidebarHeader() {
    const newChatBtn = document.querySelector('header button[aria-label="Nova conversa"], header button[aria-label="New chat"]');
    if (newChatBtn) return newChatBtn.closest('header');

    const wordmark = document.querySelector('header span[aria-label="WhatsApp"]');
    if (wordmark) return wordmark.closest('header');

    return null;
  }

  /**
   * Retorna o contêiner exato dos botões de ação do cabeçalho esquerdo
   * (onde ficam "Mais opções" e "Nova conversa") para ancorar o selo de follow-up.
   */
  function getSidebarHeaderActions() {
    const header = getSidebarHeader();
    if (!header) return null;

    const newChatBtn = header.querySelector('button[aria-label="Nova conversa"], button[aria-label="New chat"]');
    if (!newChatBtn) return null;

    let node = newChatBtn.parentElement;
    while (node && node !== header) {
      if (node.querySelector('button[aria-label="Mais opções"], button[aria-label="More options"]')) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  function getFiltersRow() {
    const byAria = document.querySelector('div[role="group"][aria-label="Filtros de conversas"], div[role="group"][aria-label="Chat filters"]');
    if (byAria) return byAria;

    const allBtn = document.querySelector('button#all-filter');
    if (allBtn) return allBtn.closest('div[role="group"]') || allBtn.parentElement?.parentElement?.parentElement;

    return null;
  }

  function getMessageInput() {
    return document.querySelector('footer div[contenteditable="true"][role="textbox"]');
  }

  function getChatFooter() {
    const input = getMessageInput();
    if (input) return input.closest('footer');
    return document.querySelector('#main footer');
  }

  function getChatHeader() {
    const footer = getChatFooter();
    if (footer && footer.parentElement) {
      const header = footer.parentElement.querySelector('header');
      if (header) return header;
    }
    const infoBtn = document.querySelector('header button[aria-label="Informações de contato"], header button[aria-label="Contact info"], header button[aria-label="Dados do grupo"], header button[aria-label="Group info"]');
    return infoBtn ? infoBtn.closest('header') : null;
  }

  /**
   * Retorna o contêiner dos ícones da direita no cabeçalho do chat ativo
   * (ancorado pelo botão "Pesquisar", presente em chats individuais e grupos).
   */
  function getChatHeaderActions() {
    const header = getChatHeader();
    if (!header) return null;

    const searchBtn = header.querySelector('button[aria-label="Pesquisar"], button[aria-label="Search"]');
    if (!searchBtn) return null;

    let node = searchBtn.parentElement;
    while (node && node !== header) {
      if (node.querySelector('button[aria-label="Mais opções"], button[aria-label="More options"]')) {
        return node;
      }
      node = node.parentElement;
    }
    return null;
  }

  /**
   * Extrai a chave única do contato (incluindo emojis via alt) e o primeiro nome limpo.
   */
  function getActiveContactInfo() {
    const header = getChatHeader();
    const input = getMessageInput();
    if (!header && !input) return null;

    let fullName = '';

    // 1. Tenta extrair do botão de informações de contato (via aria-labelledby)
    if (header) {
      const infoBtn = header.querySelector('button[aria-label="Informações de contato"], button[aria-label="Contact info"], button[aria-label="Dados do grupo"], button[aria-label="Group info"]');
      const labelledBy = infoBtn?.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ids = labelledBy.split(/\s+/);
        for (const id of ids) {
          if (id === infoBtn.id) continue;
          const labelEl = document.getElementById(id);
          if (labelEl) {
            fullName = extractTextWithEmojis(labelEl);
            if (fullName) break;
          }
        }
      }

      // Fallback dentro do header: primeiro span[dir="auto"]
      if (!fullName) {
        const span = header.querySelector('span[dir="auto"]');
        if (span) fullName = extractTextWithEmojis(span);
      }
    }

    // 2. Fallback via aria-label do input ("Digite uma mensagem para Amor❤️")
    if (!fullName && input) {
      const aria = input.getAttribute('aria-label') || '';
      const match = aria.match(/^(?:Digite uma mensagem para|Type a message to)\s+(.+)$/i);
      if (match) fullName = match[1].trim();
    }

    if (!fullName) return null;

    // Primeiro nome limpo para a variável {nome}
    let firstName = '';
    if (!/^[\+\d\s\-\(\)]+$/.test(fullName)) {
      const cleaned = fullName.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();
      firstName = cleaned.split(/\s+/)[0] || '';
    }

    return {
      contactKey: fullName,
      firstName
    };
  }

  function extractTextWithEmojis(element) {
    let result = '';
    element.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        result += node.textContent;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        if (node.tagName === 'IMG' && node.alt) {
          result += node.alt;
        } else {
          result += extractTextWithEmojis(node);
        }
      }
    });
    return result.trim();
  }

  function getSendButton() {
    const footer = getChatFooter();
    if (!footer) return null;
    return footer.querySelector('button[aria-label="Enviar"], button[aria-label="Send"]');
  }

  function getAttachButton() {
    const footer = getChatFooter();
    if (!footer) return null;
    return footer.querySelector('button[aria-label="Anexar"], button[aria-label="Attach"]');
  }

  function getSearchInput() {
    return document.querySelector(
      '#side input[aria-label*="Pesquisar" i], #side input[aria-label*="Search" i]'
    );
  }

  function getChatListPane() {
    return document.querySelector('#pane-side');
  }

  function getVisibleChatRows() {
    const grid = document.querySelector('#pane-side div[role="grid"][aria-label]');
    if (!grid) return [];
    return Array.from(grid.querySelectorAll('div[role="row"]'));
  }

  function getRowContactKey(rowEl) {
    const titleSpan =
      rowEl.querySelector('div[role="gridcell"][aria-colindex="2"] span[dir="auto"][title]') ||
      rowEl.querySelector('span[dir="auto"][title]');
    if (!titleSpan) return '';
    return extractTextWithEmojis(titleSpan);
  }

  function triggerNativeChatClick(rowEl) {
    const cellContainer = rowEl.querySelector('[data-testid="cell-frame-container"], [data-testid="message-yourself-row"]');
    const ariaSelected = rowEl.querySelector('div[aria-selected]');
    const gridCell = rowEl.querySelector('div[role="gridcell"][tabindex="0"]');

    console.log('[ZapCopilot Nav] Elementos encontrados na row para clique:', {
      rowEl,
      cellContainer,
      ariaSelected,
      gridCell
    });

    const targets = [cellContainer, ariaSelected, gridCell, rowEl].filter(Boolean);
    const primaryTarget = targets[0];

    const rect = primaryTarget.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    console.log('[ZapCopilot Nav] Disparando eventos no alvo principal:', {
      tag: primaryTarget.tagName,
      testId: primaryTarget.getAttribute('data-testid'),
      coords: { clientX, clientY, width: rect.width, height: rect.height }
    });

    const mouseOpts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY
    };

    primaryTarget.dispatchEvent(new PointerEvent('pointerdown', { ...mouseOpts, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    primaryTarget.dispatchEvent(new MouseEvent('mousedown', mouseOpts));
    primaryTarget.dispatchEvent(new PointerEvent('pointerup', { ...mouseOpts, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    primaryTarget.dispatchEvent(new MouseEvent('mouseup', mouseOpts));
    primaryTarget.dispatchEvent(new MouseEvent('click', mouseOpts));

    // Fallback de acessibilidade: foca o gridcell e envia Enter caso o React ignore o MouseEvent sintético
    if (gridCell) {
      gridCell.focus();
      gridCell.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Enter',
        code: 'Enter',
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true
      }));
    }
  }

  async function openChatByContactKey(contactKey) {
    console.log('[ZapCopilot Nav] 1. Iniciando openChatByContactKey para:', JSON.stringify(contactKey));
    if (!contactKey) {
      console.warn('[ZapCopilot Nav] contactKey vazio, abortando.');
      return false;
    }

    const cleanCompare = (str) =>
      str.replace(/\uFE0F/g, '').replace(/\s+/g, ' ').trim().toLowerCase();

    const cleanAlphaNum = (str) =>
      str.replace(/[^\p{L}\p{N}\s+\-()]/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();

    const targetExact = cleanCompare(contactKey);
    const targetAlpha = cleanAlphaNum(contactKey);

    const findMatchingRow = (stageLabel) => {
      const rows = getVisibleChatRows();
      const mapped = rows.map(r => ({
        row: r,
        rawKey: getRowContactKey(r),
        exact: cleanCompare(getRowContactKey(r)),
        alpha: cleanAlphaNum(getRowContactKey(r))
      }));

      console.log(`[ZapCopilot Nav] (${stageLabel}) Linhas visíveis (${mapped.length}):`, mapped.map(m => m.rawKey));

      return (
        mapped.find(m => m.exact === targetExact)?.row ||
        mapped.find(m => targetAlpha && m.alpha === targetAlpha)?.row ||
        mapped.find(m => targetAlpha && m.alpha.includes(targetAlpha))?.row ||
        null
      );
    };

    // 1. Tenta localizar nas linhas atualmente renderizadas no DOM
    const visibleMatch = findMatchingRow('Busca direta no DOM');
    if (visibleMatch) {
      console.log('[ZapCopilot Nav] 2. Match encontrado diretamente na lista visível!');
      triggerNativeChatClick(visibleMatch);
      return true;
    }

    // 2. Se estiver fora da tela (virtual scroll), preenche o campo de pesquisa
    const searchInput = getSearchInput();
    console.log('[ZapCopilot Nav] 2. Não encontrado na tela. SearchInput encontrado?', {
      encontrado: !!searchInput,
      tag: searchInput?.tagName,
      contentEditable: searchInput?.isContentEditable,
      ariaLabel: searchInput?.getAttribute('aria-label')
    });

    if (!searchInput) return false;

    const queryText = contactKey.replace(/[^\p{L}\p{N}\s+\-()]/gu, '').trim() || contactKey;
    console.log('[ZapCopilot Nav] 3. Inserindo termo na pesquisa:', JSON.stringify(queryText));

    searchInput.focus();
    await new Promise(r => setTimeout(r, 60));

    if (searchInput.tagName === 'INPUT') {
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      if (nativeSetter) {
        nativeSetter.call(searchInput, queryText);
      } else {
        searchInput.value = queryText;
      }
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      const dt = new DataTransfer();
      dt.setData('text/plain', queryText);
      searchInput.dispatchEvent(new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      }));
    }

    console.log('[ZapCopilot Nav] 4. Valor atual no searchInput após inserção:', {
      value: searchInput.value,
      textContent: searchInput.textContent
    });

    // Aguarda até 1.5s o WhatsApp filtrar a lista e clica no contato
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 150));
      const match = findMatchingRow(`Tentativa busca #${i + 1}`);
      if (match) {
        console.log('[ZapCopilot Nav] 5. Match encontrado após busca! Clicando...');
        triggerNativeChatClick(match);
        return true;
      }
    }

    console.warn('[ZapCopilot Nav] 6. Nenhum match encontrado após todas as tentativas.');
    return false;
  }

  return {
    getSidebarHeader,
    getSidebarHeaderActions,
    getFiltersRow,
    getMessageInput,
    getChatFooter,
    getChatHeader,
    getChatHeaderActions,
    getActiveContactInfo,
    getSendButton,
    getAttachButton,
    getSearchInput,
    getChatListPane,
    getVisibleChatRows,
    getRowContactKey,
    openChatByContactKey
  };
})();