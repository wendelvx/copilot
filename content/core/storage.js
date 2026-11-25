window.ZapCopilot = window.ZapCopilot || {};

window.ZapCopilot.Storage = (() => {
  const LIMITS = {
    FREE: {
      maxShortcuts: 3,
      maxFollowups: 3,
      maxCustomTags: 2,
      allowMedia: false,
      allowBackup: false
    },
    PRO: {
      maxShortcuts: Infinity,
      maxFollowups: Infinity,
      maxCustomTags: Infinity,
      allowMedia: true,
      allowBackup: true
    }
  };

  const DEFAULT_STATE = {
    shortcuts: [
      {
        id: 'sc_default_1',
        command: 'oi',
        title: 'Saudação Inicial',
        favorite: true,
        delayMs: 2000,
        blocks: [
          { type: 'text', content: '{saudacao}, {nome}! Tudo bem? Como posso te ajudar hoje?' }
        ]
      },
      {
        id: 'sc_default_2',
        command: 'pix',
        title: 'Chave PIX',
        favorite: true,
        delayMs: 2000,
        blocks: [
          { type: 'text', content: 'Segue nossa chave PIX para pagamento:\n\nChave: seuemail@dominio.com.br\nAssim que concluir, me envie o comprovante por aqui!' }
        ]
      }
    ],
    followups: [],
    customTags: [
      { id: 'tag_orcamento', label: 'Orçamento', color: '#f59e0b' },
      { id: 'tag_fechado', label: 'Fechado', color: '#10b981' }
    ],
    chatTags: {},
    settings: {
      showQuickBar: true,
      defaultDelayMs: 2000
    },
    license: {
      plan: 'FREE',
      key: null,
      email: null,
      verifiedAt: null
    }
  };

  function isPro(license) {
    if (!license || license.plan !== 'PRO') return false;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    if (license.verifiedAt && Date.now() - license.verifiedAt > SEVEN_DAYS_MS) {
      return false;
    }
    return true;
  }

  async function getLimits() {
    const { license } = await getAll();
    return isPro(license) ? LIMITS.PRO : LIMITS.FREE;
  }

  async function getAll() {
    const data = await chrome.storage.local.get(Object.keys(DEFAULT_STATE));
    return {
      shortcuts: data.shortcuts ?? DEFAULT_STATE.shortcuts,
      followups: data.followups ?? DEFAULT_STATE.followups,
      customTags: data.customTags ?? DEFAULT_STATE.customTags,
      chatTags: data.chatTags ?? DEFAULT_STATE.chatTags,
      settings: { ...DEFAULT_STATE.settings, ...(data.settings || {}) },
      license: { ...DEFAULT_STATE.license, ...(data.license || {}) }
    };
  }

  async function saveShortcuts(shortcuts) {
    const limits = await getLimits();
    if (shortcuts.length > limits.maxShortcuts) {
      throw new Error('LIMIT_SHORTCUTS');
    }
    const hasMedia = shortcuts.some(sc => sc.blocks.some(b => b.type !== 'text'));
    if (hasMedia && !limits.allowMedia) {
      throw new Error('LIMIT_MEDIA');
    }
    await chrome.storage.local.set({ shortcuts });
  }

  async function saveFollowups(followups) {
    const limits = await getLimits();
    const activeCount = followups.filter(f => !f.completed).length;
    if (activeCount > limits.maxFollowups) {
      throw new Error('LIMIT_FOLLOWUPS');
    }
    await chrome.storage.local.set({ followups });
  }

  async function saveCustomTags(customTags) {
    const limits = await getLimits();
    if (customTags.length > limits.maxCustomTags) {
      throw new Error('LIMIT_TAGS');
    }
    await chrome.storage.local.set({ customTags });
  }

  async function toggleChatTag(contactKey, tagId) {
    const { chatTags } = await getAll();
    const current = new Set(chatTags[contactKey] || []);
    if (current.has(tagId)) {
      current.delete(tagId);
    } else {
      current.add(tagId);
    }
    chatTags[contactKey] = Array.from(current);
    await chrome.storage.local.set({ chatTags });
    return chatTags[contactKey];
  }

  function fileToDataUrl(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(fileOrBlob);
    });
  }

  function dataUrlToBlob(dataUrl, fallbackMime = 'application/octet-stream') {
    const [header, base64] = dataUrl.split(',');
    const mimeMatch = header.match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : fallbackMime;
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new Blob([bytes], { type: mime });
  }

  async function saveMediaBlob(id, fileOrBlob, meta = {}) {
    const dataUrl = await fileToDataUrl(fileOrBlob);
    await chrome.storage.local.set({
      [`zc_media_${id}`]: {
        id,
        dataUrl,
        name: meta.name || fileOrBlob.name || 'arquivo',
        mimeType: meta.mimeType || fileOrBlob.type || 'application/octet-stream',
        updatedAt: Date.now()
      }
    });
    return id;
  }

  async function getMediaBlob(id) {
    const key = `zc_media_${id}`;
    const res = await chrome.storage.local.get(key);
    const record = res[key];
    if (!record || !record.dataUrl) return null;

    const blob = dataUrlToBlob(record.dataUrl, record.mimeType);
    const file = new File([blob], record.name, { type: record.mimeType });
    return {
      id: record.id,
      blob: file,
      file,
      name: record.name,
      mimeType: record.mimeType
    };
  }

  async function deleteMediaBlob(id) {
    await chrome.storage.local.remove(`zc_media_${id}`);
  }

  return {
    LIMITS,
    DEFAULT_STATE,
    isPro,
    getLimits,
    getAll,
    saveShortcuts,
    saveFollowups,
    saveCustomTags,
    toggleChatTag,
    saveMediaBlob,
    getMediaBlob,
    deleteMediaBlob
  };
})();