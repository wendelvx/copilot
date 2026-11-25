window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.SequenceRunner = (() => {
  const { Composer, MediaSender } = window.ZapCopilot;

  let isRunning = false;
  let cancelRequested = false;

  const progressListeners = new Set();

  function onProgress(cb) {
    progressListeners.add(cb);
    return () => progressListeners.delete(cb);
  }

  function notify(state) {
    progressListeners.forEach(cb => {
      try {
        cb(state);
      } catch (e) {}
    });
  }

  /**
   * Calcula delay com jitter humano aleatório (±35%) para evitar intervalos fixos,
   * garantindo um piso mínimo de segurança de 1200ms entre envios.
   */
  function getHumanizedDelay(baseMs) {
    const base = Math.max(1500, baseMs || 2000);
    const jitterFactor = 0.65 + Math.random() * 0.70; // 0.65x até 1.35x
    return Math.max(1200, Math.round(base * jitterFactor));
  }

  /**
   * Aguarda o intervalo em fatias de 100ms para responder imediatamente ao botão "Cancelar".
   */
  function sleepCancellable(ms) {
    return new Promise(resolve => {
      const step = 100;
      let elapsed = 0;
      const timer = setInterval(() => {
        elapsed += step;
        if (cancelRequested || elapsed >= ms) {
          clearInterval(timer);
          resolve();
        }
      }, step);
    });
  }

  function cancel() {
    if (isRunning) {
      cancelRequested = true;
    }
  }

  /**
   * Executa um atalho completo (1 a 3 blocos).
   * @param {Object} shortcut Objeto do atalho
   * @param {Object} options { insertOnly: boolean } -> se true, apenas cola o texto sem enviar
   */
  async function run(shortcut, { insertOnly = false } = {}) {
    if (isRunning) {
      console.warn('[ZapCopilot] Já existe um disparo em andamento.');
      return false;
    }

    const blocks = (shortcut.blocks || []).slice(0, 3);
    if (blocks.length === 0) return false;

    // Se for apenas 1 bloco de texto e insertOnly = true (ex: Shift+Click para editar antes de enviar)
    if (insertOnly && blocks.length === 1 && blocks[0].type === 'text') {
      await Composer.insertText(blocks[0].content, { clearFirst: true });
      return true;
    }

    isRunning = true;
    cancelRequested = false;
    const baseDelayMs = Math.max(1500, shortcut.delayMs || 2000);

    try {
      for (let i = 0; i < blocks.length; i++) {
        if (cancelRequested) {
          notify({ status: 'cancelled', current: i + 1, total: blocks.length });
          return false;
        }

        const block = blocks[i];
        notify({
          status: 'sending',
          title: shortcut.title,
          current: i + 1,
          total: blocks.length
        });

        if (block.type === 'text') {
          await Composer.sendText(block.content, { clearFirst: true });
        } else {
          await MediaSender.sendMediaBlock(block);
        }

        // Aguarda intervalo humanizado antes do próximo bloco (exceto no último)
        if (i < blocks.length - 1) {
          const waitMs = getHumanizedDelay(baseDelayMs);
          await sleepCancellable(waitMs);

          if (cancelRequested) {
            notify({ status: 'cancelled', current: i + 1, total: blocks.length });
            return false;
          }
        }
      }

      notify({ status: 'done', total: blocks.length });
      return true;
    } catch (err) {
      console.error('[ZapCopilot] Falha ao executar sequência:', err);
      notify({ status: 'error', error: err.message });
      return false;
    } finally {
      isRunning = false;
      cancelRequested = false;
    }
  }

  return {
    run,
    cancel,
    onProgress,
    isRunning: () => isRunning
  };
})();