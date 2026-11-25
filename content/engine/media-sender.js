window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.MediaSender = (() => {
  const { Selectors, Storage, Composer } = window.ZapCopilot;

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function inferMimeType(fileName, storedMime) {
    if (storedMime && storedMime !== 'application/octet-stream') {
      return storedMime;
    }
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const map = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      txt: 'text/plain',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      ogg: 'audio/ogg',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4'
    };
    return map[ext] || storedMime || 'application/octet-stream';
  }

  function simulateRealClick(el) {
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;
    const opts = {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY
    };
    el.dispatchEvent(new PointerEvent('pointerdown', { ...opts, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mousedown', opts));
    el.dispatchEvent(new PointerEvent('pointerup', { ...opts, pointerId: 1, pointerType: 'mouse', isPrimary: true }));
    el.dispatchEvent(new MouseEvent('mouseup', opts));
    el.click();
  }

  function findCaptionInput() {
    return (
      document.querySelector('div[contenteditable="true"][data-testid="media-caption-input-container"]') ||
      document.querySelector('div[contenteditable="true"][aria-label="Adicione uma legenda"]') ||
      document.querySelector('div[contenteditable="true"][aria-label="Add a caption"]') ||
      Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"]')).find(el => !el.closest('footer')) ||
      null
    );
  }

  function findPreviewSendButton() {
    const byAriaPrefix = Array.from(
      document.querySelectorAll(
        'div[role="button"][aria-label^="Enviar" i], button[aria-label^="Enviar" i], div[role="button"][aria-label^="Send" i], button[aria-label^="Send" i]'
      )
    ).find(el => !el.closest('footer') && el.getBoundingClientRect().width > 0);

    if (byAriaPrefix) return byAriaPrefix;

    const sendTitle = Array.from(document.querySelectorAll('svg title'))
      .find(t => (t.textContent || '').trim() === 'ic-send-filled' && !t.closest('footer'));

    if (sendTitle) {
      return sendTitle.closest('div[role="button"], button') || sendTitle;
    }

    return null;
  }

  async function fillPreviewCaption(rawCaption) {
    const finalCaption = Composer.resolveVariables(rawCaption);
    if (!finalCaption) return;

    let captionInput = null;
    for (let i = 0; i < 10; i++) {
      captionInput = findCaptionInput();
      if (captionInput) break;
      await sleep(100);
    }

    if (!captionInput) return;

    captionInput.focus();
    await sleep(50);

    const dt = new DataTransfer();
    dt.setData('text/plain', finalCaption);
    captionInput.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    }));

    // Fallback caso o Lexical Editor do modal bloqueie o paste sintético
    await sleep(80);
    if (!captionInput.textContent || captionInput.textContent.trim() === '') {
      document.execCommand('insertText', false, finalCaption);
    }

    await sleep(120);
  }

  async function confirmPreviewSend(btn) {
    simulateRealClick(btn);
    await sleep(250);

    if (findPreviewSendButton()) {
      const captionInput = findCaptionInput();
      if (captionInput) {
        captionInput.focus();
        captionInput.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      }
    }

    for (let i = 0; i < 25; i++) {
      if (!findPreviewSendButton()) break;
      await sleep(150);
    }
    await sleep(300);
  }

  async function injectFileIntoWhatsApp(file) {
    const input = Selectors.getMessageInput();
    if (!input) throw new Error('Campo de mensagem não encontrado.');

    input.focus();
    await sleep(80);

    const dt = new DataTransfer();
    dt.items.add(file);

    input.dispatchEvent(new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dt
    }));

    for (let i = 0; i < 6; i++) {
      await sleep(150);
      if (findPreviewSendButton()) return true;
    }

    const dropTarget = document.querySelector('#main') || input;
    const dtDrop = new DataTransfer();
    dtDrop.items.add(file);

    ['dragenter', 'dragover', 'drop'].forEach(eventName => {
      dropTarget.dispatchEvent(new DragEvent(eventName, {
        bubbles: true,
        cancelable: true,
        dataTransfer: dtDrop
      }));
    });

    return true;
  }

  function preparePttInMainWorld(arrayBuffer) {
    return new Promise((resolve, reject) => {
      const requestId = 'ptt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      const timeout = setTimeout(() => {
        window.removeEventListener('message', onResponse);
        reject(new Error('Tempo esgotado ao preparar o áudio PTT.'));
      }, 8000);

      function onResponse(event) {
        if (event.source !== window || !event.data || event.data.source !== 'ZC_MAIN') return;
        if (event.data.requestId !== requestId) return;

        clearTimeout(timeout);
        window.removeEventListener('message', onResponse);

        if (event.data.type === 'ZC_PTT_READY') {
          resolve(event.data.durationSec);
        } else {
          reject(new Error(event.data.error || 'Erro ao decodificar áudio.'));
        }
      }

      window.addEventListener('message', onResponse);
      window.postMessage({
        source: 'ZC_CONTENT',
        type: 'ZC_PREPARE_PTT',
        requestId,
        arrayBuffer
      }, '*');
    });
  }

  function findVoiceRecordButton() {
    const footer = Selectors.getChatFooter();
    if (!footer) return null;
    return (
      footer.querySelector('button[aria-label="Mensagem de voz"], button[aria-label="Voice message"]') ||
      Array.from(footer.querySelectorAll('svg title'))
        .find(t => (t.textContent || '').trim() === 'ic-mic')
        ?.closest('button, div[role="button"]') ||
      null
    );
  }

  function findVoiceSendButton() {
    const footer = Selectors.getChatFooter();
    if (!footer) return null;
    return (
      footer.querySelector('button[aria-label="Enviar"], button[aria-label="Send"], div[role="button"][aria-label="Enviar"], div[role="button"][aria-label="Send"]') ||
      Array.from(footer.querySelectorAll('svg title'))
        .find(t => ['ic-send-filled', 'send'].includes((t.textContent || '').trim()))
        ?.closest('button, div[role="button"]') ||
      null
    );
  }

  async function sendAudioAsPtt(blob, fileName) {
    const micBtn = findVoiceRecordButton();
    if (!micBtn) {
      throw new Error('Botão de microfone não encontrado (verifique se o campo de texto está vazio).');
    }

    const arrayBuffer = await blob.arrayBuffer();
    const durationSec = await preparePttInMainWorld(arrayBuffer);

    try {
      simulateRealClick(micBtn);

      let voiceSendBtn = null;
      for (let i = 0; i < 25; i++) {
        await sleep(150);
        voiceSendBtn = findVoiceSendButton();
        if (voiceSendBtn) break;
      }

      if (!voiceSendBtn) {
        throw new Error(`Gravador de voz não iniciou para "${fileName}".`);
      }

      const waitMs = Math.min(Math.max(Math.ceil(durationSec * 1000) + 350, 1000), 180000);
      await sleep(waitMs);

      const finalSendBtn = findVoiceSendButton();
      if (!finalSendBtn) {
        throw new Error('Botão de enviar nota de voz desapareceu antes do envio.');
      }

      simulateRealClick(finalSendBtn);
      await sleep(400);
    } finally {
      window.postMessage({ source: 'ZC_CONTENT', type: 'ZC_CLEANUP_PTT' }, '*');
    }
  }

  async function sendMediaBlock(block) {
    const record = await Storage.getMediaBlob(block.mediaId);
    if (!record || !record.blob) {
      throw new Error(`Arquivo de mídia não encontrado (${block.fileName || block.mediaId}).`);
    }

    const fileName = record.name || block.fileName || 'arquivo';

    if (block.type === 'audio') {
      await sendAudioAsPtt(record.blob, fileName);
      return true;
    }

    const mimeType = inferMimeType(fileName, record.mimeType || record.blob.type);
    const file = new File([record.blob], fileName, { type: mimeType });

    await injectFileIntoWhatsApp(file);

    let previewSendBtn = null;
    for (let i = 0; i < 30; i++) {
      previewSendBtn = findPreviewSendButton();
      if (previewSendBtn) break;
      await sleep(150);
    }

    if (!previewSendBtn) {
      throw new Error(`Tela de pré-visualização não abriu para "${fileName}".`);
    }

    if (block.caption && block.caption.trim()) {
      await fillPreviewCaption(block.caption);
    }

    await sleep(150);
    await confirmPreviewSend(previewSendBtn);
    return true;
  }

  return { sendMediaBlock };
})();