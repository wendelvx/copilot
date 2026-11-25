(() => {
  if (window.__zcPttBridgeInstalled) return;
  window.__zcPttBridgeInstalled = true;

  let pendingAudioBuffer = null;
  let activeAudioContext = null;
  let activeSourceNode = null;

  function cleanupVirtualStream() {
    if (activeSourceNode) {
      try { activeSourceNode.stop(); } catch (e) {}
      try { activeSourceNode.disconnect(); } catch (e) {}
      activeSourceNode = null;
    }
    if (activeAudioContext) {
      try { activeAudioContext.close(); } catch (e) {}
      activeAudioContext = null;
    }
    pendingAudioBuffer = null;
  }

  // Ouve comandos do content script isolado (media-sender.js)
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.source !== 'ZC_CONTENT') return;

    const { type, requestId, arrayBuffer } = event.data;

    if (type === 'ZC_PREPARE_PTT') {
      try {
        cleanupVirtualStream();
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const tempCtx = new AudioCtx();
        const decoded = await tempCtx.decodeAudioData(arrayBuffer.slice(0));
        await tempCtx.close();

        pendingAudioBuffer = decoded;

        window.postMessage({
          source: 'ZC_MAIN',
          type: 'ZC_PTT_READY',
          requestId,
          durationSec: decoded.duration
        }, '*');
      } catch (err) {
        cleanupVirtualStream();
        window.postMessage({
          source: 'ZC_MAIN',
          type: 'ZC_PTT_ERROR',
          requestId,
          error: err.message || 'Falha ao decodificar arquivo de áudio.'
        }, '*');
      }
    } else if (type === 'ZC_CLEANUP_PTT') {
      cleanupVirtualStream();
    }
  });

  // Intercepta getUserMedia apenas quando há um áudio preparado pelo ZapCopilot
  const mediaDevices = navigator.mediaDevices;
  if (mediaDevices && typeof mediaDevices.getUserMedia === 'function') {
    const originalGetUserMedia = mediaDevices.getUserMedia.bind(mediaDevices);

    mediaDevices.getUserMedia = async function (constraints) {
      if (pendingAudioBuffer && constraints && constraints.audio) {
        const bufferToPlay = pendingAudioBuffer;
        pendingAudioBuffer = null;

        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        const destination = ctx.createMediaStreamDestination();
        const source = ctx.createBufferSource();
        source.buffer = bufferToPlay;
        source.connect(destination);

        activeAudioContext = ctx;
        activeSourceNode = source;

        // Inicia a reprodução do buffer direto no stream virtual do microfone
        source.start(0);
        return destination.stream;
      }

      return originalGetUserMedia(constraints);
    };
  }
})();