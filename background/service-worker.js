chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({ installedAt: Date.now() });
  }
  chrome.alarms.create('check_followups', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'check_followups') return;

  const { followups = [] } = await chrome.storage.local.get('followups');
  const now = Date.now();
  let updated = false;

  for (const item of followups) {
    if (!item.completed && !item.notified && item.dueAt <= now) {
      item.notified = true;
      updated = true;

      chrome.notifications.create(`followup_${item.id}`, {
        type: 'basic',
        iconUrl: '../assets/icons/icon128.png',
        title: `Follow-up: ${item.contactName}`,
        message: item.note || 'Hora de retornar este atendimento no WhatsApp Web.',
        priority: 2
      });
    }
  }

  if (updated) {
    await chrome.storage.local.set({ followups });
  }
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_POPUP') {
    if (chrome.action && chrome.action.openPopup) {
      chrome.action.openPopup().catch(() => {});
    }
  }
});