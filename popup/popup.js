(() => {
  const LIMITS = {
    FREE: { maxShortcuts: 3, maxCustomTags: 2, maxFollowups: 3, allowMedia: false, allowBackup: false },
    PRO: { maxShortcuts: Infinity, maxCustomTags: Infinity, maxFollowups: Infinity, allowMedia: true, allowBackup: true }
  };

  // Deixe vazio ('') enquanto testa localmente; preencha com a URL do seu backend em produção
  const LICENSE_API_BASE = '';
  const MAX_MEDIA_BYTES = 15 * 1024 * 1024; // 15 MB por mídia

  let state = {
    shortcuts: [],
    followups: [],
    customTags: [],
    chatTags: {},
    settings: { showQuickBar: true, defaultDelayMs: 2000 },
    license: { plan: 'FREE', key: null, verifiedAt: null, maxDevices: 1 },
    deviceId: null
  };

  let draftBlocks = [];
  let activeRecorder = null;
  let activeRecordingIdx = null;
  let activeStream = null;
  let recordingTimer = null;
  let recordingSeconds = 0;

  function fileToDataUrl(fileOrBlob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(fileOrBlob);
    });
  }

  async function saveMediaAsset(id, fileOrBlob, meta = {}) {
    const dataUrl = await fileToDataUrl(fileOrBlob);
    const name = meta.name || fileOrBlob.name || 'arquivo';
    const mimeType = meta.mimeType || fileOrBlob.type || 'application/octet-stream';

    await chrome.storage.local.set({
      [`zc_media_${id}`]: {
        id,
        dataUrl,
        name,
        mimeType,
        updatedAt: Date.now()
      }
    });
    return { id, dataUrl, name, mimeType };
  }

  async function getMediaDataUrl(id) {
    if (!id) return null;
    const key = `zc_media_${id}`;
    const res = await chrome.storage.local.get(key);
    return res[key]?.dataUrl || null;
  }

  async function removeUnusedMedia(shortcut) {
    if (!shortcut?.blocks) return;
    const keysToRemove = shortcut.blocks
      .filter(b => b.mediaId)
      .map(b => `zc_media_${b.mediaId}`);
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
  }

  function stopActiveRecording() {
    if (recordingTimer) {
      clearInterval(recordingTimer);
      recordingTimer = null;
    }
    if (activeRecorder && activeRecorder.state !== 'inactive') {
      try { activeRecorder.stop(); } catch (e) {}
    }
    if (activeStream) {
      activeStream.getTracks().forEach(t => t.stop());
      activeStream = null;
    }
    activeRecorder = null;
    activeRecordingIdx = null;
    recordingSeconds = 0;
  }

  function formatDuration(sec) {
    const m = String(Math.floor(sec / 60)).padStart(2, '0');
    const s = String(sec % 60).padStart(2, '0');
    return `${m}:${s}`;
  }

  function formatDateTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function insertVariableAtCursor(textarea, idx, token) {
    if (!textarea) return;
    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? textarea.value.length;
    const current = textarea.value;
    const updated = current.slice(0, start) + token + current.slice(end);

    textarea.value = updated;
    draftBlocks[idx].content = updated;
    textarea.focus();

    const newPos = start + token.length;
    textarea.setSelectionRange(newPos, newPos);
  }

  function isPro() {
    return state.license?.plan === 'PRO';
  }

  function getLimits() {
    return isPro() ? LIMITS.PRO : LIMITS.FREE;
  }

  function switchTab(tabName) {
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));
  }

  async function ensureDeviceId(existingId) {
    if (existingId) return existingId;
    const newId = (crypto.randomUUID ? crypto.randomUUID() : 'dev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10));
    await chrome.storage.local.set({ deviceId: newId });
    return newId;
  }

  async function loadState() {
    const data = await chrome.storage.local.get([
      'shortcuts', 'followups', 'customTags', 'chatTags', 'settings', 'license', 'deviceId'
    ]);
    state.shortcuts = data.shortcuts || [];
    state.followups = data.followups || [];
    state.customTags = data.customTags || [];
    state.chatTags = data.chatTags || {};
    state.settings = { showQuickBar: true, defaultDelayMs: 2000, ...(data.settings || {}) };
    state.license = { plan: 'FREE', key: null, verifiedAt: null, maxDevices: 1, ...(data.license || {}) };
    state.deviceId = await ensureDeviceId(data.deviceId);
    renderAll();
  }

  function renderAll() {
    const badge = document.getElementById('plan-badge');
    const topCta = document.getElementById('btn-upgrade-top');
    if (isPro()) {
      badge.textContent = 'PLANO PRO ATIVO';
      badge.className = 'badge pro';
      topCta.style.display = 'none';
    } else {
      badge.textContent = 'PLANO GRATUITO';
      badge.className = 'badge free';
      topCta.style.display = 'inline-block';
    }

    renderShortcuts();
    renderFollowups();
    renderTags();
    document.getElementById('cfg-show-quickbar').checked = state.settings.showQuickBar !== false;
    if (state.license.key) {
      document.getElementById('license-key-input').value = state.license.key;
      document.getElementById('license-status-msg').textContent = isPro()
        ? '✅ Licença PRO ativa neste navegador.'
        : '⚠️ Licença expirada ou inválida.';
    }
  }

  async function moveShortcut(index, direction) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= state.shortcuts.length) return;
    const copy = [...state.shortcuts];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    state.shortcuts = copy;
    await chrome.storage.local.set({ shortcuts: state.shortcuts });
    renderShortcuts();
  }

  function renderShortcuts() {
    const limits = getLimits();
    const counter = document.getElementById('shortcuts-counter');
    counter.textContent = isPro()
      ? `${state.shortcuts.length} atalhos cadastrados (Ilimitado)`
      : `${state.shortcuts.length}/${limits.maxShortcuts} atalhos usados`;

    const list = document.getElementById('shortcuts-list');
    list.innerHTML = '';

    state.shortcuts.forEach((sc, idx) => {
      const first = sc.blocks?.[0];
      const preview = first?.type === 'text'
        ? first.content
        : `[${(first?.type || 'mídia').toUpperCase()}] ${first?.fileName || ''}`;

      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div style="min-width:0;flex:1;">
          <div>
            <span class="item-title">${sc.title}</span>
            <span class="item-cmd">/${sc.command}</span>
            ${sc.blocks.length > 1 ? `<span class="pro-tag">${sc.blocks.length} blocos</span>` : ''}
          </div>
          <div class="item-sub">${preview}</div>
        </div>
        <div class="item-actions" style="display:flex;gap:4px;flex-shrink:0;">
          <button class="btn-xs" data-up="${idx}" title="Mover para cima" ${idx === 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>⬆️</button>
          <button class="btn-xs" data-down="${idx}" title="Mover para baixo" ${idx === state.shortcuts.length - 1 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>⬇️</button>
          <button class="btn-xs" data-edit="${sc.id}" title="Editar">✏️</button>
          <button class="btn-xs" data-del="${sc.id}" title="Excluir">🗑️</button>
        </div>
      `;

      const upBtn = item.querySelector('[data-up]');
      if (upBtn && idx > 0) upBtn.addEventListener('click', () => moveShortcut(idx, -1));

      const downBtn = item.querySelector('[data-down]');
      if (downBtn && idx < state.shortcuts.length - 1) downBtn.addEventListener('click', () => moveShortcut(idx, 1));

      item.querySelector('[data-edit]').addEventListener('click', () => openShortcutForm(sc));
      item.querySelector('[data-del]').addEventListener('click', async () => {
        const target = state.shortcuts.find(s => s.id === sc.id);
        await removeUnusedMedia(target);
        state.shortcuts = state.shortcuts.filter(s => s.id !== sc.id);
        await chrome.storage.local.set({ shortcuts: state.shortcuts });
        renderShortcuts();
      });
      list.appendChild(item);
    });
  }

  function renderFollowups() {
    let container = document.getElementById('followups-list');
    if (!container) {
      const shortcutsList = document.getElementById('shortcuts-list');
      if (!shortcutsList || !shortcutsList.parentElement) return;

      const wrapper = document.createElement('div');
      wrapper.id = 'zc-followups-section';
      wrapper.style.marginTop = '14px';
      wrapper.style.paddingTop = '12px';
      wrapper.style.borderTop = '1px solid #e5e7eb';
      wrapper.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <strong style="font-size:13px;">⏰ Lembretes de Follow-up</strong>
          <span id="followups-counter" class="muted" style="font-size:11.5px;"></span>
        </div>
        <div id="followups-list"></div>
      `;
      shortcutsList.insertAdjacentElement('afterend', wrapper);
      container = document.getElementById('followups-list');
    }

    const pending = state.followups
      .filter(f => !f.completed)
      .sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));

    const counterEl = document.getElementById('followups-counter');
    if (counterEl) {
      const limits = getLimits();
      counterEl.textContent = isPro()
        ? `${pending.length} ativos (Ilimitado)`
        : `${pending.length}/${limits.maxFollowups} ativos`;
    }

    container.innerHTML = '';
    if (pending.length === 0) {
      container.innerHTML = `<div class="muted" style="font-size:12px;">Nenhum follow-up pendente no momento.</div>`;
      return;
    }

    pending.forEach(fu => {
      const overdue = fu.dueAt && fu.dueAt <= Date.now();
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div style="min-width:0;flex:1;">
          <div>
            <span class="item-title">${fu.contactKey}</span>
            <span class="item-cmd" style="${overdue ? 'background:#fee2e2;color:#b91c1c;' : ''}">
              ${overdue ? '⚠️ Vencido • ' : '🕒 '}${formatDateTime(fu.dueAt)}
            </span>
          </div>
          <div class="item-sub">${fu.note || 'Sem observação'}</div>
        </div>
        <div class="item-actions" style="display:flex;gap:4px;flex-shrink:0;">
          <button class="btn-xs" data-done-fu="${fu.id}" title="Concluir follow-up">✅</button>
          <button class="btn-xs" data-del-fu="${fu.id}" title="Excluir follow-up">🗑️</button>
        </div>
      `;

      item.querySelector('[data-done-fu]').addEventListener('click', async () => {
        state.followups = state.followups.map(f => f.id === fu.id ? { ...f, completed: true, completedAt: Date.now() } : f);
        await chrome.storage.local.set({ followups: state.followups });
        renderFollowups();
      });

      item.querySelector('[data-del-fu]').addEventListener('click', async () => {
        state.followups = state.followups.filter(f => f.id !== fu.id);
        await chrome.storage.local.set({ followups: state.followups });
        renderFollowups();
      });

      container.appendChild(item);
    });
  }

  function openInDedicatedTab(shortcutId = null, pendingBlockType = null) {
    const params = new URLSearchParams({ full: '1' });
    if (shortcutId) params.set('edit', shortcutId);
    if (pendingBlockType) params.set('addBlock', pendingBlockType);
    chrome.tabs.create({ url: chrome.runtime.getURL(`popup/popup.html?${params.toString()}`) });
    window.close();
  }

  async function openShortcutForm(shortcut = null, pendingBlockType = null) {
    const hasMediaBlocks = shortcut?.blocks?.some(b => b.type !== 'text');
    const needsDedicatedTab = Boolean(hasMediaBlocks || pendingBlockType);

    if (needsDedicatedTab && window.innerWidth < 500 && !location.search.includes('full=1')) {
      openInDedicatedTab(shortcut?.id || null, pendingBlockType);
      return;
    }

    const limits = getLimits();
    if (!shortcut && state.shortcuts.length >= limits.maxShortcuts) {
      alert('Você atingiu o limite de 3 atalhos do Plano Gratuito. Ative o PRO para criar atalhos ilimitados!');
      switchTab('pro');
      return;
    }

    stopActiveRecording();

    document.getElementById('shortcut-form-card').classList.remove('hidden');
    document.getElementById('form-title').textContent = shortcut ? 'Editar Atalho' : 'Novo Atalho';
    document.getElementById('sc-id').value = shortcut?.id || '';
    document.getElementById('sc-command').value = shortcut?.command || '';
    document.getElementById('sc-title').value = shortcut?.title || '';
    document.getElementById('sc-favorite').checked = shortcut ? shortcut.favorite !== false : true;
    document.getElementById('sc-delay').value = (shortcut?.delayMs || 2000) / 1000;

    draftBlocks = shortcut
      ? JSON.parse(JSON.stringify(shortcut.blocks))
      : [{ type: 'text', content: '' }];

    if (pendingBlockType && draftBlocks.length < 3) {
      draftBlocks.push({ type: pendingBlockType, mediaId: null, fileName: '' });
    }

    for (const blk of draftBlocks) {
      if (blk.type === 'audio' && blk.mediaId && !blk.previewUrl) {
        blk.previewUrl = await getMediaDataUrl(blk.mediaId);
      }
    }

    renderDraftBlocks();
  }

  function moveDraftBlock(index, direction) {
    if (activeRecorder) {
      alert('Pare a gravação de áudio antes de reordenar os blocos.');
      return;
    }
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= draftBlocks.length) return;

    const copy = [...draftBlocks];
    const [moved] = copy.splice(index, 1);
    copy.splice(targetIndex, 0, moved);
    draftBlocks = copy;
    renderDraftBlocks();
  }

  async function toggleAudioRecording(idx) {
    if (activeRecorder && activeRecordingIdx === idx) {
      stopActiveRecording();
      return;
    }

    if (activeRecorder) {
      stopActiveRecording();
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm'];
      const mimeType = preferredTypes.find(t => MediaRecorder.isTypeSupported(t)) || '';

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      const chunks = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunks.push(e.data);
      };

      recorder.onstop = async () => {
        const finalMime = recorder.mimeType || 'audio/webm';
        const ext = finalMime.includes('ogg') ? 'ogg' : 'webm';
        const audioBlob = new Blob(chunks, { type: finalMime });

        if (audioBlob.size > MAX_MEDIA_BYTES) {
          alert('A gravação excedeu o limite de 15 MB.');
          renderDraftBlocks();
          return;
        }

        const mediaId = 'media_' + Date.now() + '_' + idx;
        const fileName = `gravacao-${new Date().toISOString().slice(11, 19).replace(/:/g, '-')}.${ext}`;
        const saved = await saveMediaAsset(mediaId, audioBlob, { name: fileName, mimeType: finalMime });

        draftBlocks[idx].mediaId = mediaId;
        draftBlocks[idx].fileName = fileName;
        draftBlocks[idx].mimeType = finalMime;
        draftBlocks[idx].previewUrl = saved.dataUrl;
        renderDraftBlocks();
      };

      activeStream = stream;
      activeRecorder = recorder;
      activeRecordingIdx = idx;
      recordingSeconds = 0;

      recorder.start();
      renderDraftBlocks();

      recordingTimer = setInterval(() => {
        recordingSeconds += 1;
        const timerEl = document.getElementById(`rec-timer-${idx}`);
        if (timerEl) timerEl.textContent = formatDuration(recordingSeconds);
      }, 1000);
    } catch (err) {
      stopActiveRecording();
      alert('Não foi possível acessar o microfone. Verifique as permissões do navegador.');
    }
  }

  function renderDraftBlocks() {
    const container = document.getElementById('blocks-container');
    container.innerHTML = '';

    draftBlocks.forEach((blk, idx) => {
      const div = document.createElement('div');
      div.className = 'block-item';

      const labels = { text: '📝 Texto', image: '🖼️ Imagem', document: '📄 Documento/PDF', audio: '🎙️ Áudio (PTT)' };
      const isRecordingThis = activeRecorder && activeRecordingIdx === idx;

      let bodyHtml = '';
      if (blk.type === 'text') {
        bodyHtml = `
          <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
            <span class="muted" style="font-size:11px;">Inserir variável:</span>
            <button type="button" class="btn-xs" data-var="{nome}" title="Primeiro nome do contato">+ {nome}</button>
            <button type="button" class="btn-xs" data-var="{nome_completo}" title="Nome completo do contato">+ {nome_completo}</button>
            <button type="button" class="btn-xs" data-var="{saudacao}" title="Bom dia / Boa tarde / Boa noite">+ {saudacao}</button>
          </div>
          <textarea data-idx="${idx}" placeholder="Ex: {saudacao}, {nome}! Tudo bem?">${blk.content || ''}</textarea>
        `;
      } else if (blk.type === 'audio') {
        bodyHtml = `
          <div style="display:flex;gap:8px;align-items:center;margin-bottom:6px;flex-wrap:wrap;">
            <button type="button" class="btn-xs" data-rec-idx="${idx}" style="${isRecordingThis ? 'background:#dc2626;color:#fff;border-color:#dc2626;' : ''}">
              ${isRecordingThis ? `⏹️ Parar (<span id="rec-timer-${idx}">${formatDuration(recordingSeconds)}</span>)` : '🎙️ Gravar agora'}
            </button>
            <span class="muted">ou anexe um arquivo:</span>
          </div>
          <input type="file" data-file-idx="${idx}" accept=".ogg,.mp3,.wav,.m4a,.webm,audio/*" />
          <div class="muted" style="margin-top:4px;">${blk.fileName ? `Áudio pronto: ${blk.fileName}` : 'Grave pelo microfone ou selecione um arquivo (máx. 15 MB)'}</div>
          ${blk.previewUrl ? `<audio controls src="${blk.previewUrl}" style="width:100%;height:34px;margin-top:6px;"></audio>` : ''}
        `;
      } else {
        bodyHtml = `
          <input type="file" data-file-idx="${idx}" accept="${blk.type === 'image' ? 'image/*' : '.pdf,.doc,.docx,.xls,.xlsx,*/*'}" />
          <div class="muted" style="margin-top:4px;">${blk.fileName ? `Arquivo pronto: ${blk.fileName}` : 'Selecione o arquivo (máx. 15 MB)'}</div>
        `;
      }

      div.innerHTML = `
        <div class="block-item-head" style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span><strong>${idx + 1}º envio:</strong> ${labels[blk.type] || blk.type}</span>
          <div style="display:flex;gap:4px;align-items:center;">
            ${draftBlocks.length > 1 ? `
              <button type="button" class="btn-xs" data-blk-up="${idx}" title="Enviar antes" ${idx === 0 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>⬆️</button>
              <button type="button" class="btn-xs" data-blk-down="${idx}" title="Enviar depois" ${idx === draftBlocks.length - 1 ? 'disabled style="opacity:0.4;cursor:default;"' : ''}>⬇️</button>
              <button type="button" class="btn-xs" data-rm="${idx}" title="Remover bloco">Remover</button>
            ` : ''}
          </div>
        </div>
        ${bodyHtml}
      `;

      const blkUp = div.querySelector('[data-blk-up]');
      if (blkUp && idx > 0) {
        blkUp.addEventListener('click', () => moveDraftBlock(idx, -1));
      }

      const blkDown = div.querySelector('[data-blk-down]');
      if (blkDown && idx < draftBlocks.length - 1) {
        blkDown.addEventListener('click', () => moveDraftBlock(idx, 1));
      }

      if (div.querySelector('[data-rm]')) {
        div.querySelector('[data-rm]').addEventListener('click', () => {
          if (activeRecordingIdx === idx) stopActiveRecording();
          draftBlocks.splice(idx, 1);
          renderDraftBlocks();
        });
      }

      const recBtn = div.querySelector('[data-rec-idx]');
      if (recBtn) {
        recBtn.addEventListener('click', () => toggleAudioRecording(idx));
      }

      const ta = div.querySelector('textarea');
      if (ta) {
        ta.addEventListener('input', (e) => {
          draftBlocks[idx].content = e.target.value;
        });

        div.querySelectorAll('[data-var]').forEach(varBtn => {
          varBtn.addEventListener('click', () => {
            insertVariableAtCursor(ta, idx, varBtn.dataset.var);
          });
        });
      }

      const fileInput = div.querySelector('input[type="file"]');
      if (fileInput) {
        fileInput.addEventListener('change', async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (file.size > MAX_MEDIA_BYTES) {
            alert('O arquivo excede o limite de 15 MB.');
            e.target.value = '';
            return;
          }
          if (activeRecordingIdx === idx) stopActiveRecording();

          const mediaId = 'media_' + Date.now() + '_' + idx;
          const saved = await saveMediaAsset(mediaId, file);
          draftBlocks[idx].mediaId = mediaId;
          draftBlocks[idx].fileName = file.name;
          draftBlocks[idx].mimeType = file.type;
          if (blk.type === 'audio') {
            draftBlocks[idx].previewUrl = saved.dataUrl;
          }
          renderDraftBlocks();
        });
      }

      container.appendChild(div);
    });
  }

  function renderTags() {
    const limits = getLimits();
    document.getElementById('tags-counter').textContent = isPro()
      ? `${state.customTags.length} etiquetas (Ilimitado)`
      : `${state.customTags.length}/${limits.maxCustomTags} etiquetas usadas`;

    const list = document.getElementById('tags-list');
    list.innerHTML = '';

    state.customTags.forEach(tag => {
      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="width:12px;height:12px;border-radius:50%;background:${tag.color};display:inline-block;"></span>
          <span class="item-title">${tag.label}</span>
        </div>
        <button class="btn-xs" data-del-tag="${tag.id}">🗑️</button>
      `;
      item.querySelector('[data-del-tag]').addEventListener('click', async () => {
        state.customTags = state.customTags.filter(t => t.id !== tag.id);
        await chrome.storage.local.set({ customTags: state.customTags });
        renderTags();
      });
      list.appendChild(item);
    });
  }

  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  document.getElementById('btn-upgrade-top').addEventListener('click', () => switchTab('pro'));
  document.getElementById('btn-new-shortcut').addEventListener('click', () => openShortcutForm(null));
  document.getElementById('btn-cancel-sc').addEventListener('click', () => {
    stopActiveRecording();
    document.getElementById('shortcut-form-card').classList.add('hidden');
  });

  document.querySelectorAll('[data-add-block]').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.addBlock;
      if (type !== 'text' && !getLimits().allowMedia) {
        alert('O envio de imagens, PDFs e áudios em sequência é exclusivo do Plano PRO.');
        switchTab('pro');
        return;
      }
      if (draftBlocks.length >= 3) {
        alert('Cada atalho suporta no máximo 3 blocos em sequência.');
        return;
      }

      if (type !== 'text' && window.innerWidth < 500 && !location.search.includes('full=1')) {
        const currentId = document.getElementById('sc-id').value || null;
        openInDedicatedTab(currentId, type);
        return;
      }

      draftBlocks.push(type === 'text' ? { type: 'text', content: '' } : { type, mediaId: null, fileName: '' });
      renderDraftBlocks();
    });
  });

  document.getElementById('btn-save-sc').addEventListener('click', async () => {
    if (activeRecorder) {
      alert('Pare a gravação de áudio antes de salvar o atalho.');
      return;
    }

    const id = document.getElementById('sc-id').value;
    const command = document.getElementById('sc-command').value.trim().replace(/^\/+/, '').toLowerCase();
    const title = document.getElementById('sc-title').value.trim();
    const favorite = document.getElementById('sc-favorite').checked;
    const delayMs = Math.max(1500, (parseFloat(document.getElementById('sc-delay').value) || 2) * 1000);

    if (!command || !title) {
      alert('Preencha o comando e o título do atalho.');
      return;
    }

    const validBlocks = draftBlocks
      .filter(b => (b.type === 'text' ? b.content?.trim() : b.mediaId))
      .map(({ previewUrl, ...cleanBlock }) => cleanBlock);

    if (validBlocks.length === 0) {
      alert('Adicione pelo menos um bloco válido.');
      return;
    }

    const payload = {
      id: id || 'sc_' + Date.now(),
      command,
      title,
      favorite,
      delayMs,
      blocks: validBlocks
    };

    if (id) {
      state.shortcuts = state.shortcuts.map(s => s.id === id ? payload : s);
    } else {
      state.shortcuts.push(payload);
    }

    await chrome.storage.local.set({ shortcuts: state.shortcuts });
    document.getElementById('shortcut-form-card').classList.add('hidden');
    renderShortcuts();
  });

  document.getElementById('btn-add-tag').addEventListener('click', async () => {
    const limits = getLimits();
    if (state.customTags.length >= limits.maxCustomTags) {
      alert('Limite de 2 etiquetas atingido no Plano Gratuito. Ative o PRO para etiquetas ilimitadas!');
      switchTab('pro');
      return;
    }
    const label = document.getElementById('tag-label').value.trim();
    const color = document.getElementById('tag-color').value;
    if (!label) return;

    state.customTags.push({ id: 'tag_' + Date.now(), label, color });
    await chrome.storage.local.set({ customTags: state.customTags });
    document.getElementById('tag-label').value = '';
    renderTags();
  });

  document.getElementById('cfg-show-quickbar').addEventListener('change', async (e) => {
    state.settings.showQuickBar = e.target.checked;
    await chrome.storage.local.set({ settings: state.settings });
  });

  document.getElementById('btn-export-json').addEventListener('click', () => {
    if (!getLimits().allowBackup) {
      alert('A exportação e restauração de backup (.json) está disponível no Plano PRO.');
      switchTab('pro');
      return;
    }
    const backup = {
      exportedAt: new Date().toISOString(),
      shortcuts: state.shortcuts,
      customTags: state.customTags,
      settings: state.settings
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `copiloto-whatsapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });

  document.getElementById('btn-import-json').addEventListener('click', () => {
    if (!getLimits().allowBackup) {
      alert('A importação de backup (.json) está disponível no Plano PRO.');
      switchTab('pro');
      return;
    }
    document.getElementById('import-file-input').click();
  });

  document.getElementById('import-file-input').addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (Array.isArray(parsed.shortcuts)) state.shortcuts = parsed.shortcuts;
      if (Array.isArray(parsed.customTags)) state.customTags = parsed.customTags;
      if (parsed.settings) state.settings = { ...state.settings, ...parsed.settings };

      await chrome.storage.local.set({
        shortcuts: state.shortcuts,
        customTags: state.customTags,
        settings: state.settings
      });
      renderAll();
      alert('Backup restaurado com sucesso!');
    } catch (err) {
      alert('Arquivo .json inválido.');
    }
  });

  document.getElementById('btn-activate-license').addEventListener('click', async () => {
    const key = document.getElementById('license-key-input').value.trim().toUpperCase();
    if (!key) return;

    // 1. Validação online real quando LICENSE_API_BASE estiver configurada
    if (LICENSE_API_BASE) {
      try {
        const url = `${LICENSE_API_BASE}/api/license/verify?key=${encodeURIComponent(key)}&deviceId=${encodeURIComponent(state.deviceId)}`;
        const resp = await fetch(url);
        const data = await resp.json();

        if (resp.ok && data.valid) {
          state.license = {
            plan: 'PRO',
            key,
            verifiedAt: Date.now(),
            maxDevices: data.maxDevices || 1
          };
          await chrome.storage.local.set({ license: state.license });
          renderAll();
          alert('Plano PRO ativado com sucesso!');
        } else {
          alert(data.message || 'Não foi possível validar esta chave de licença.');
        }
      } catch (err) {
        alert('Erro de conexão ao verificar a licença. Tente novamente em instantes.');
      }
      return;
    }

    // 2. Fallback para testes locais antes de conectar a API
    if (key.startsWith('PRO-') && key.length >= 8) {
      state.license = {
        plan: 'PRO',
        key,
        verifiedAt: Date.now(),
        maxDevices: 1
      };
      await chrome.storage.local.set({ license: state.license });
      renderAll();
      alert('Plano PRO ativado com sucesso!');
      return;
    }

    alert('Chave inválida. Para testar localmente, use uma chave no formato PRO-TESTE-2026.');
  });

  loadState().then(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('full') === '1') {
      const editId = params.get('edit');
      const addBlock = params.get('addBlock');
      const target = editId ? state.shortcuts.find(s => s.id === editId) : null;
      openShortcutForm(target || null, addBlock || null);
    }
  });
})();