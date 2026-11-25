(() => {
  const LIMITS = {
    FREE: { maxShortcuts: 3, maxCustomTags: 2, allowMedia: false, allowBackup: false },
    PRO: { maxShortcuts: Infinity, maxCustomTags: Infinity, allowMedia: true, allowBackup: true }
  };

  const MAX_MEDIA_BYTES = 15 * 1024 * 1024; // 15 MB por mídia

  let state = {
    shortcuts: [],
    followups: [],
    customTags: [],
    chatTags: {},
    settings: { showQuickBar: true, defaultDelayMs: 2000 },
    license: { plan: 'FREE', key: null, verifiedAt: null }
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

  async function loadState() {
    const data = await chrome.storage.local.get([
      'shortcuts', 'followups', 'customTags', 'chatTags', 'settings', 'license'
    ]);
    state.shortcuts = data.shortcuts || [];
    state.followups = data.followups || [];
    state.customTags = data.customTags || [];
    state.chatTags = data.chatTags || {};
    state.settings = { showQuickBar: true, defaultDelayMs: 2000, ...(data.settings || {}) };
    state.license = { plan: 'FREE', key: null, verifiedAt: null, ...(data.license || {}) };
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
    renderTags();
    document.getElementById('cfg-show-quickbar').checked = state.settings.showQuickBar !== false;
    if (state.license.key) {
      document.getElementById('license-key-input').value = state.license.key;
      document.getElementById('license-status-msg').textContent = isPro()
        ? '✅ Licença PRO ativa neste navegador.'
        : '⚠️ Licença expirada ou inválida.';
    }
  }

  function renderShortcuts() {
    const limits = getLimits();
    const counter = document.getElementById('shortcuts-counter');
    counter.textContent = isPro()
      ? `${state.shortcuts.length} atalhos cadastrados (Ilimitado)`
      : `${state.shortcuts.length}/${limits.maxShortcuts} atalhos usados`;

    const list = document.getElementById('shortcuts-list');
    list.innerHTML = '';

    state.shortcuts.forEach(sc => {
      const first = sc.blocks?.[0];
      const preview = first?.type === 'text'
        ? first.content
        : `[${(first?.type || 'mídia').toUpperCase()}] ${first?.fileName || ''}`;

      const item = document.createElement('div');
      item.className = 'list-item';
      item.innerHTML = `
        <div>
          <div>
            <span class="item-title">${sc.title}</span>
            <span class="item-cmd">/${sc.command}</span>
            ${sc.blocks.length > 1 ? `<span class="pro-tag">${sc.blocks.length} blocos</span>` : ''}
          </div>
          <div class="item-sub">${preview}</div>
        </div>
        <div class="item-actions">
          <button class="btn-xs" data-edit="${sc.id}" title="Editar">✏️</button>
          <button class="btn-xs" data-del="${sc.id}" title="Excluir">🗑️</button>
        </div>
      `;
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

  async function openShortcutForm(shortcut = null) {
    // Abre em aba completa para evitar que o popup feche ao abrir seletor de arquivos ou permissão de microfone
    if (window.innerWidth < 500 && !location.search.includes('full=1')) {
      const params = new URLSearchParams({ full: '1' });
      if (shortcut?.id) params.set('edit', shortcut.id);
      chrome.tabs.create({ url: chrome.runtime.getURL(`popup/popup.html?${params.toString()}`) });
      window.close();
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

    // Carrega preview de áudio caso esteja editando um atalho existente com áudio
    for (const blk of draftBlocks) {
      if (blk.type === 'audio' && blk.mediaId && !blk.previewUrl) {
        blk.previewUrl = await getMediaDataUrl(blk.mediaId);
      }
    }

    renderDraftBlocks();
  }

  async function toggleAudioRecording(idx) {
    // Se já está gravando este bloco, para e salva
    if (activeRecorder && activeRecordingIdx === idx) {
      stopActiveRecording();
      return;
    }

    // Se estava gravando outro bloco, interrompe antes
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
        bodyHtml = `<textarea data-idx="${idx}" placeholder="Use {nome} e {saudacao}...">${blk.content || ''}</textarea>`;
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
        <div class="block-item-head">
          <span>Bloco ${idx + 1}: ${labels[blk.type] || blk.type}</span>
          ${draftBlocks.length > 1 ? `<button type="button" class="btn-xs" data-rm="${idx}">Remover</button>` : ''}
        </div>
        ${bodyHtml}
      `;

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

    // Remove previewUrl antes de salvar para não duplicar o Base64 dentro de state.shortcuts
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

    if (key.startsWith('PRO-') && key.length >= 8) {
      state.license = {
        plan: 'PRO',
        key,
        verifiedAt: Date.now()
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
      const target = editId ? state.shortcuts.find(s => s.id === editId) : null;
      openShortcutForm(target || null);
    }
  });
})();