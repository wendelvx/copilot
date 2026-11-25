const LICENSE_API_BASE = ''; // Preencha com a URL do seu backend em produção
const OFFLINE_GRACE_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias de tolerância offline (PRD)

// Ícone fallback 1x1 transparente caso ../assets/icons/icon128.png ainda não exista
const FALLBACK_ICON_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

const DEFAULT_SHORTCUTS = [
  {
    id: 'sc_default_oi',
    command: 'oi',
    title: 'Saudação Inicial',
    favorite: true,
    delayMs: 2000,
    blocks: [
      {
        type: 'text',
        content: '{saudacao}, {nome}! Tudo bem? Como posso te ajudar hoje?'
      }
    ]
  },
  {
    id: 'sc_default_pix',
    command: 'pix',
    title: 'Dados de Pagamento',
    favorite: true,
    delayMs: 2000,
    blocks: [
      {
        type: 'text',
        content:
          'Segue nossa chave PIX para facilitar:\n\nChave: [Digite sua chave aqui]\nFavorecido: [Seu Nome / Empresa]\n\nAssim que fizer, me envia o comprovante por aqui!'
      }
    ]
  },
  {
    id: 'sc_default_retorno',
    command: 'retorno',
    title: 'Cobrar Retorno',
    favorite: true,
    delayMs: 2000,
    blocks: [
      {
        type: 'text',
        content:
          'Oi, {nome}! Passando só para saber se ficou alguma dúvida sobre o que conversamos. Fico à disposição!'
      }
    ]
  }
];

function ensureAlarms() {
  chrome.alarms.get('check_followups', (existing) => {
    if (!existing) {
      chrome.alarms.create('check_followups', { periodInMinutes: 1 });
    }
  });

  chrome.alarms.get('verify_license', (existing) => {
    if (!existing) {
      chrome.alarms.create('verify_license', { periodInMinutes: 720 }); // a cada 12h
    }
  });
}

async function resolveNotificationIcon() {
  try {
    const iconUrl = chrome.runtime.getURL('assets/icons/icon128.png');
    const resp = await fetch(iconUrl);
    if (resp.ok) return iconUrl;
  } catch (e) {}
  return FALLBACK_ICON_DATA_URL;
}

async function checkDueFollowups() {
  const { followups = [] } = await chrome.storage.local.get('followups');
  const now = Date.now();
  let updated = false;
  let iconUrl = null;

  for (const item of followups) {
    if (!item.completed && !item.notified && item.dueAt <= now) {
      item.notified = true;
      updated = true;

      if (!iconUrl) {
        iconUrl = await resolveNotificationIcon();
      }

      const contactLabel = item.contactName || item.contactKey || 'Cliente';
      chrome.notifications.create(`followup_${item.id}`, {
        type: 'basic',
        iconUrl,
        title: `Follow-up: ${contactLabel}`,
        message: item.note || 'Hora de retornar este atendimento no WhatsApp Web.',
        priority: 2
      });
    }
  }

  if (updated) {
    await chrome.storage.local.set({ followups });
  }
}

async function revalidateProLicense() {
  const { license, deviceId } = await chrome.storage.local.get(['license', 'deviceId']);
  if (!license || license.plan !== 'PRO' || !license.key) return;

  // Enquanto não houver API configurada (modo teste local), mantém ativa
  if (!LICENSE_API_BASE) return;

  try {
    const url = `${LICENSE_API_BASE}/api/license/verify?key=${encodeURIComponent(license.key)}&deviceId=${encodeURIComponent(deviceId || '')}`;
    const resp = await fetch(url);
    const data = await resp.json();

    if (resp.ok && data.valid) {
      await chrome.storage.local.set({
        license: {
          ...license,
          plan: 'PRO',
          verifiedAt: Date.now(),
          maxDevices: data.maxDevices || license.maxDevices || 1
        }
      });
    } else if (resp.status === 401 || resp.status === 403 || data.valid === false) {
      await chrome.storage.local.set({
        license: {
          ...license,
          plan: 'FREE',
          revokedAt: Date.now()
        }
      });
    }
  } catch (err) {
    // Sem internet: verifica se ultrapassou os 7 dias de tolerância offline do PRD
    const lastVerified = license.verifiedAt || 0;
    if (Date.now() - lastVerified > OFFLINE_GRACE_MS) {
      await chrome.storage.local.set({
        license: {
          ...license,
          plan: 'FREE'
        }
      });
    }
  }
}

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    const existing = await chrome.storage.local.get(['installedAt', 'shortcuts']);
    const updates = { installedAt: existing.installedAt || Date.now() };

    if (!Array.isArray(existing.shortcuts) || existing.shortcuts.length === 0) {
      updates.shortcuts = DEFAULT_SHORTCUTS;
    }

    await chrome.storage.local.set(updates);
  }
  ensureAlarms();
  await checkDueFollowups();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
  checkDueFollowups();
  revalidateProLicense();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'check_followups') {
    await checkDueFollowups();
  } else if (alarm.name === 'verify_license') {
    await revalidateProLicense();
  }
});

// Ao clicar na notificação nativa, abre/foca o WhatsApp Web e aponta para o contato do follow-up
chrome.notifications.onClicked.addListener(async (notificationId) => {
  chrome.notifications.clear(notificationId);

  const followupId = notificationId.replace(/^followup_/, '');
  const { followups = [] } = await chrome.storage.local.get('followups');
  const target = followups.find(f => String(f.id) === followupId);
  const contactKey = target?.contactKey || target?.contactName || null;

  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tabs.length > 0) {
    const tab = tabs[0];
    await chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId) {
      await chrome.windows.update(tab.windowId, { focused: true });
    }
    if (contactKey) {
      chrome.tabs.sendMessage(tab.id, { type: 'OPEN_CHAT', contactKey }).catch(() => {});
    }
  } else {
    const newTab = await chrome.tabs.create({ url: 'https://web.whatsapp.com/' });
    if (contactKey) {
      await chrome.storage.local.set({ pendingOpenContact: contactKey });
    }
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_POPUP') {
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {});
    }
  } else if (msg.type === 'VERIFY_LICENSE_NOW') {
    revalidateProLicense();
  }
});