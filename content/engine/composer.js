window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.Composer = (() => {
  const { Selectors } = window.ZapCopilot;

  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  /**
   * Substitui {nome} e {saudacao} no template.
   * Se o contato não tiver nome salvo (ex: número avulso), evita espaços duplos antes de vírgulas.
   */
  function resolveVariables(template) {
    if (!template) return '';
    const info = Selectors.getActiveContactInfo();
    const firstName = info?.firstName || '';
    const greeting = getGreeting();

    let text = template
      .replace(/\{saudacao\}/gi, greeting)
      .replace(/\{nome\}/gi, firstName);

    if (!firstName) {
      text = text
        .replace(/,\s*!/g, '!')
        .replace(/,\s*\?/g, '?')
        .replace(/,\s*\./g, '.')
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