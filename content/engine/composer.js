window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.Composer = (() => {
  const { Selectors } = window.ZapCopilot;

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function getCleanContactNames() {
    const info = Selectors.getActiveContactInfo ? Selectors.getActiveContactInfo() : null;
    let rawName = (info?.fullName || info?.name || info?.firstName || '').trim();

    // Fallback direto no DOM do cabeçalho caso Selectors retorne vazio
    if (!rawName) {
      const header = document.querySelector('#main header');
      const titleEl =
        header?.querySelector('span[dir="auto"][title]') ||
        header?.querySelector('div[role="button"] span[dir="auto"]') ||
        header?.querySelector('span[dir="auto"]');
      rawName = (titleEl?.getAttribute('title') || titleEl?.textContent || '').trim();
    }

    const lower = rawName.toLowerCase();
    // Ignora números de telefone não salvos (+55...) ou status ("online", "digitando...")
    if (
      !rawName ||
      lower === 'online' ||
      lower.includes('digitando') ||
      lower.includes('gravando') ||
      lower.includes('visto por último') ||
      /^\+?\d[\d\s().-]+$/.test(rawName)
    ) {
      return { firstName: '', fullName: '' };
    }

    const parts = rawName.split(/\s+/);
    const firstWord = parts[0].replace(/[^\p{L}-]/gu, '');
    const firstName = firstWord
      ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1).toLowerCase()
      : '';

    return { firstName, fullName: rawName };
  }

  /**
   * Substitui {nome}, {nome_completo} e {saudacao} no template.
   * Se o contato não tiver nome salvo (número avulso), limpa pontuações sobrando.
   */
  function resolveVariables(template) {
    if (!template) return '';
    const { firstName, fullName } = getCleanContactNames();
    const greeting = getGreeting();

    let text = template
      .replace(/\{saudacao\}/gi, greeting)
      .replace(/\{nome_completo\}/gi, fullName)
      .replace(/\{nome\}/gi, firstName);

    if (!firstName) {
      text = text
        .replace(/,\s*([!?.])/g, '$1')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    return text;
  }

  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Insere texto no Lexical Editor simulando um ClipboardEvent('paste').
   */
  async function insertText(rawText, { clearFirst = false } = {}) {
    const input = Selectors.getMessageInput();
    if (!input) throw new Error('Campo de mensagem não encontrado.');

    const finalText = resolveVariables(rawText);
    input.focus();
    await sleep(40);

    if (clearFirst) {
      document.execCommand('selectAll', false, null);
      document.execCommand('delete', false, null);
      await sleep(30);
    }

    const dataTransfer = new DataTransfer();
    dataTransfer.setData('text/plain', finalText);

    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: dataTransfer
    });

    input.dispatchEvent(pasteEvent);

    // Fallback caso o Lexical bloqueie paste sintético
    await sleep(60);
    if (!input.textContent || input.textContent.trim() === '') {
      document.execCommand('insertText', false, finalText);
    }

    return finalText;
  }

  /**
   * Insere o texto e clica no botão Enviar assim que ele aparecer no footer.
   */
  async function sendText(rawText, { clearFirst = true } = {}) {
    await insertText(rawText, { clearFirst });

    for (let i = 0; i < 15; i++) {
      const sendBtn = Selectors.getSendButton();
      if (sendBtn) {
        sendBtn.click();
        await sleep(50);
        const input = Selectors.getMessageInput();
        if (input) input.focus();
        return true;
      }
      await sleep(100);
    }

    throw new Error('Botão Enviar não apareceu após inserir o texto.');
  }

  return {
    getGreeting,
    resolveVariables,
    insertText,
    sendText
  };
})();