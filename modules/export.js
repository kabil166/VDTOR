/* ====================================
   VDTOR — Export Module
   Client-side rendering & download
   ==================================== */
'use strict';

const ExportEngine = (() => {

  const PRESETS = {
    youtube:   { label:'YouTube 1080p', res:'1920x1080', fps:30, format:'mp4', quality:8 },
    youtube4k: { label:'YouTube 4K',    res:'3840x2160', fps:30, format:'mp4', quality:9 },
    instagram: { label:'Instagram',     res:'1080x1080', fps:30, format:'mp4', quality:8 },
    tiktok:    { label:'TikTok',        res:'1080x1920', fps:30, format:'mp4', quality:8 },
    twitter:   { label:'Twitter/X',     res:'1280x720',  fps:30, format:'mp4', quality:7 },
    custom:    { label:'Custom',        res:'1920x1080', fps:30, format:'mp4', quality:8 }
  };

  let exportSettings = { ...PRESETS.youtube, filename: 'my-video' };
  let exporting = false;
  let cancelled = false;

  function init() {
    // Export modal triggers
    document.getElementById('btn-export-top').addEventListener('click', openModal);
    document.getElementById('btn-custom-export').addEventListener('click', openModal);
    document.getElementById('btn-export').addEventListener('click', openModal);
    document.querySelectorAll('.export-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.preset];
        if (preset) applyPreset(btn.dataset.preset);
        openModal();
      });
    });

    document.getElementById('btn-close-export').addEventListener('click', closeModal);
    document.getElementById('btn-cancel-export').addEventListener('click', closeModal);
    document.getElementById('modal-backdrop') && document.getElementById('modal-backdrop').addEventListener('click', closeModal);

    document.getElementById('btn-start-export').addEventListener('click', startExport);

    // Format buttons
    document.querySelectorAll('#export-format-group .btn-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#export-format-group .btn-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exportSettings.format = btn.dataset.val;
      });
    });

    // Resolution buttons
    document.querySelectorAll('#export-res-group .btn-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#export-res-group .btn-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exportSettings.res = btn.dataset.val;
      });
    });

    // FPS buttons
    document.querySelectorAll('#export-fps-group .btn-opt').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#export-fps-group .btn-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        exportSettings.fps = parseInt(btn.dataset.val);
      });
    });

    // Preset select
    document.getElementById('export-preset-select').addEventListener('change', (e) => {
      applyPreset(e.target.value);
    });

    // Quality
    document.getElementById('export-quality').addEventListener('input', (e) => {
      exportSettings.quality = parseInt(e.target.value);
    });

    // Filename
    document.getElementById('export-filename').addEventListener('input', (e) => {
      exportSettings.filename = e.target.value || 'my-video';
    });
  }

  function applyPreset(name) {
    const preset = PRESETS[name];
    if (!preset) return;
    exportSettings = { ...preset, filename: exportSettings.filename };

    // Update UI buttons
    const [w, h] = preset.res.split('x');
    document.querySelectorAll('#export-res-group .btn-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === preset.res);
    });
    document.querySelectorAll('#export-fps-group .btn-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === String(preset.fps));
    });
    document.querySelectorAll('#export-format-group .btn-opt').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.val === preset.format);
    });
    document.getElementById('export-quality').value = preset.quality;
  }

  function openModal() {
    document.getElementById('export-modal').style.display = 'flex';
  }

  function closeModal() {
    if (!exporting) {
      document.getElementById('export-modal').style.display = 'none';
    }
    cancelled = true;
  }

  async function startExport() {
    if (exporting) return;
    exporting = true;
    cancelled = false;

    const clips = Timeline.getAllClips();
    if (clips.length === 0) {
      Toast.show('Add clips to the timeline first', 'warning');
      exporting = false;
      return;
    }

    const progressSection = document.getElementById('export-progress-section');
    const progressFill = document.getElementById('export-progress-fill');
    const progressText = document.getElementById('export-progress-text');
    const startBtn = document.getElementById('btn-start-export');

    progressSection.style.display = 'block';
    startBtn.disabled = true;
    startBtn.textContent = 'Exporting…';

    try {
      // Determine output dimensions
      const [outW, outH] = exportSettings.res.split('x').map(Number);
      const fps = exportSettings.fps;
      const totalDuration = clips.reduce((max, {clip}) => Math.max(max, clip.startTime + clip.duration), 0);

      // Create offscreen canvas for rendering
      const renderCanvas = document.createElement('canvas');
      renderCanvas.width = outW; renderCanvas.height = outH;
      const renderCtx = renderCanvas.getContext('2d');

      // Collect all frames using MediaRecorder
      const chunks = [];
      const stream = renderCanvas.captureStream(fps);
      const mimeType = getSupportedMimeType(exportSettings.format);
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: exportSettings.quality * 2e6 });

      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      await new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = reject;
        recorder.start(100);

        const frameDuration = 1/fps;
        let frameTime = 0;
        const totalFrames = Math.ceil(totalDuration * fps);
        let frameIdx = 0;

        function renderNextFrame() {
          if (cancelled) { recorder.stop(); return; }

          if (frameTime > totalDuration) {
            recorder.stop();
            return;
          }

          // Render this frame
          renderFrameAt(renderCtx, outW, outH, frameTime, clips);

          const pct = Math.min(99, (frameIdx / totalFrames) * 100);
          progressFill.style.width = pct + '%';
          progressText.textContent = `Rendering frame ${frameIdx+1} / ${totalFrames} (${Math.round(pct)}%)`;

          frameTime += frameDuration;
          frameIdx++;

          // Use setTimeout to not block UI
          if (frameIdx % 4 === 0) {
            setTimeout(renderNextFrame, 0);
          } else {
            renderNextFrame();
          }
        }

        renderNextFrame();
      });

      if (cancelled) {
        progressText.textContent = 'Export cancelled.';
        exporting = false;
        startBtn.disabled = false;
        startBtn.textContent = '⬇ Export';
        return;
      }

      progressFill.style.width = '100%';
      progressText.textContent = 'Encoding complete! Preparing download…';

      // Download
      const ext = formatToExt(exportSettings.format);
      const blobType = mimeType;
      const blob = new Blob(chunks, { type: blobType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${exportSettings.filename}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);

      Toast.show(`Export complete: ${exportSettings.filename}.${ext}`, 'success');
      setTimeout(() => {
        closeModal();
        progressSection.style.display = 'none';
        progressFill.style.width = '0%';
        startBtn.textContent = '⬇ Export';
        startBtn.disabled = false;
        exporting = false;
      }, 2000);

    } catch(err) {
      console.error('Export error:', err);
      Toast.show('Export failed: ' + (err.message || 'Unknown error'), 'error');
      progressText.textContent = 'Export failed. See console for details.';
      startBtn.textContent = '⬇ Export';
      startBtn.disabled = false;
      exporting = false;
    }
  }

  function renderFrameAt(ctx, w, h, time, clips) {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // Find all clips at this time, sorted by track order
    const activeClips = clips.filter(({clip}) =>
      time >= clip.startTime && time < clip.startTime + clip.duration
    );

    activeClips.forEach(({clip, track}) => {
      const asset = AssetManager.getById(clip.assetId);
      if (!asset) return;

      ctx.save();
      ctx.globalAlpha = clip.opacity || 1;

      if (asset.type === 'image') {
        const img = new Image();
        // synchronous image (already loaded)
        img.src = asset.url;
        if (img.complete) ctx.drawImage(img, 0, 0, w, h);
      } else if (asset.type === 'video') {
        // We can't easily render video frames synchronously in export
        // In a real implementation this would use requestVideoFrameCallback or FFmpeg
        ctx.fillStyle = 'rgba(60,60,80,0.8)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = `${w/30}px Inter`;
        ctx.textAlign = 'center';
        ctx.fillText(clip.name, w/2, h/2);
      }

      ctx.restore();
    });

    // Text overlays
    const textCtx = ctx;
    TextEngine.render(document.createElement('canvas'), textCtx, w, h, time);
  }

  function getSupportedMimeType(format) {
    const types = {
      mp4: ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'],
      webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
      mov: ['video/mp4', 'video/webm'],
      gif: ['video/webm', 'video/mp4']
    };
    const candidates = types[format] || types.webm;
    return candidates.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
  }

  function formatToExt(format) {
    const exts = { mp4:'mp4', webm:'webm', mov:'mov', gif:'webm' };
    return exts[format] || 'webm';
  }

  return { init, openModal };
})();
