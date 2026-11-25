window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.DomObserver = (() => {
  const { Selectors } = window.ZapCopilot;

  let isAppReady = false;
  let lastChatKey = null;
  let debounceTimer = null;

  const listeners = {
    appReady: new Set(),
    chatChanged: new Set(),
    domUpdated: new Set()
  };

  function on(event, callback) {
    if (listeners[event]) {
      listeners[event].add(callback);
      if (event === 'appReady' && isAppReady) {
        callback();
      }
    }
    return () => listeners[event]?.delete(callback);
  }

  function emit(event, payload) {
    listeners[event]?.forEach(cb => {
      try {
        cb(payload);
      } catch (err) {
        console.error(`[ZapCopilot] Erro no listener "${event}":`, err);
      }
    });
  }

  function evaluateDOM() {
    const sidebarHeader = Selectors.getSidebarHeader();
    if (!sidebarHeader) return;

    if (!isAppReady) {
      isAppReady = true;
      console.log('[ZapCopilot] WhatsApp Web detectado e pronto.');
      emit('appReady');
    }

    const contactInfo = Selectors.getActiveContactInfo();

    if (contactInfo) {
      if (contactInfo.contactKey !== lastChatKey) {
        lastChatKey = contactInfo.contactKey;
        emit('chatChanged', {
          ...contactInfo,
          headerEl: Selectors.getChatHeader(),
          footerEl: Selectors.getChatFooter()
        });
      }
    } else if (lastChatKey !== null) {
      lastChatKey = null;
      emit('chatChanged', null);
    }

    emit('domUpdated');
  }

  function start() {
    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(evaluateDOM, 180);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    evaluateDOM();
  }

  return { start, on, getCurrentChatKey: () => lastChatKey };
})();