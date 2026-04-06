/* ====================================
   VDTOR — Video Player / Renderer v2
   Multi-track compositor + Chroma Key
   ==================================== */
'use strict';

const Player = (() => {
  let canvas, ctx;
  let isPlaying = false;
  let looping = false;
  let playbackRate = 1;
  let currentTime = 0;
  let duration = 0;
  let rafId = null;
  let lastFrameTime = 0;

  // Primary clip being previewed (double-clicked)
  let activeClip = null;
  let activeAsset = null;

  // ---- Video Element Pool ----
  // Map of assetId → HTMLVideoElement for multi-track playback
  const videoPool = new Map();
  // The foreground and background elements used each frame
  let fgVideoEl = null;   // top/selected track video
  let bgVideoEl = null;   // lower track video (for chroma key compositing)

  // Hidden video element node (primary, always in pool)
  let primaryVideoEl = null;

  function getOrCreateVideo(assetId, src) {
    if (videoPool.has(assetId)) return videoPool.get(assetId);
    const v = document.createElement('video');
    v.src = src;
    v.preload = 'auto';
    v.muted = true;
    v.playsInline = true;
    v.crossOrigin = 'anonymous';
    v.style.display = 'none';
    document.body.appendChild(v);
    videoPool.set(assetId, v);
    return v;
  }

  function init() {
    canvas = document.getElementById('preview-canvas');
    // Use willReadFrequently for faster getImageData (chroma key)
    ctx = canvas ? canvas.getContext('2d', { willReadFrequently: true }) : null;

    // Primary video element (hidden, already in DOM via index.html)
    primaryVideoEl = document.getElementById('preview-video');
    if (primaryVideoEl) {
      primaryVideoEl.muted = true;
      primaryVideoEl.crossOrigin = 'anonymous';
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    bindControls();
    drawIdleFrame();
  }

  function resizeCanvas() {
    const container = document.getElementById('preview-container');
    if (!container || !canvas) return;
    const W = container.clientWidth;
    const H = container.clientHeight;
    const targetAspect = (activeAsset && activeAsset.width && activeAsset.height)
      ? activeAsset.width / activeAsset.height : 16 / 9;

    let cw = W, ch = H;
    if (W / H > targetAspect) { cw = H * targetAspect; }
    else { ch = W / targetAspect; }

    canvas.width = Math.round(cw);
    canvas.height = Math.round(ch);
    canvas.style.width = canvas.width + 'px';
    canvas.style.height = canvas.height + 'px';

    const textCanvas = document.getElementById('text-canvas');
    if (textCanvas) {
      textCanvas.style.width = canvas.width + 'px';
      textCanvas.style.height = canvas.height + 'px';
    }
  }

  function drawIdleFrame() {
    if (!ctx) return;
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const grad = ctx.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#0d0d20');
    grad.addColorStop(1, '#0a1a2e');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    const cx = w / 2, cy = h / 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.shadowColor = 'rgba(124,58,237,0.5)';
    ctx.shadowBlur = 30;
    ctx.fillStyle = 'rgba(124,58,237,0.3)';
    ctx.beginPath(); ctx.arc(0, 0, 40, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.moveTo(-12, -16); ctx.lineTo(-12, 16); ctx.lineTo(18, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.font = "14px 'Inter', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('Import media and add to timeline', cx, cy + 60);
    ctx.font = "11px 'Inter', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillText('Drag & drop video files to get started', cx, cy + 80);
  }

  // ---- setClip: called when user double-clicks a clip ----
  function setClip(clip, asset) {
    activeClip = clip;
    activeAsset = asset;
    if (!asset) return;

    if (asset.type === 'video' || asset.type === 'audio') {
      fgVideoEl = getOrCreateVideo(asset.id, asset.url);
      // Sync the primary hidden video too (for audio via Web Audio)
      if (primaryVideoEl) {
        primaryVideoEl.src = asset.url;
        primaryVideoEl.currentTime = 0;
      }
      fgVideoEl.currentTime = 0;
      currentTime = 0;
      duration = asset.duration || fgVideoEl.duration || 0;

      fgVideoEl.addEventListener('loadedmetadata', () => {
        duration = fgVideoEl.duration;
        updateDurationDisplay();
        resizeCanvas();
        renderFrame();
      }, { once: true });

      updateDurationDisplay();
      resizeCanvas();
      renderFrame();
    } else if (asset.type === 'image') {
      fgVideoEl = null;
      const img = new Image();
      img.onload = () => {
        resizeCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        applyEffectsAndKey(currentTime);
      };
      img.src = asset.url;
    }
  }

  // ---- Multi-track: find the background video ----
  // Called each frame to update bgVideoEl for ChromaKey compositing
  function updateBgTrack() {
    if (!window.Timeline || !window.AppState) return;
    if (!window.ChromaKey || !ChromaKey.isEnabled()) return;

    const allClips = Timeline.getAllClips ? Timeline.getAllClips() : null;
    if (!allClips || allClips.length === 0) {
      bgVideoEl = null;
      ChromaKey.setBackgroundVideo(null);
      return;
    }

    // Find clips active at currentTime, sorted by track index ascending (bottom = 0)
    const active = allClips.filter(({ clip }) =>
      currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration
    ).sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));

    if (active.length < 2) {
      bgVideoEl = null;
      ChromaKey.setBackgroundVideo(null);
      return;
    }

    // The lowest indexed clip is the background
    const bgEntry = active[0];
    const bgAsset = window.AssetManager
      ? AssetManager.getAssetById(bgEntry.clip.assetId)
      : null;

    if (bgAsset && bgAsset.type === 'video') {
      bgVideoEl = getOrCreateVideo(bgAsset.id, bgAsset.url);
      // Sync time
      const expectedTime = (currentTime - bgEntry.clip.startTime) + (bgEntry.clip.inPoint || 0);
      if (Math.abs(bgVideoEl.currentTime - expectedTime) > 0.1) {
        bgVideoEl.currentTime = expectedTime;
      }
      if (isPlaying && bgVideoEl.paused) bgVideoEl.play().catch(() => {});
      if (!isPlaying && !bgVideoEl.paused) bgVideoEl.pause();
    } else {
      bgVideoEl = null;
    }

    ChromaKey.setBackgroundVideo(bgVideoEl);
  }

  // ---- Render pipeline ----
  function renderFrame() {
    if (!ctx || !canvas) return;
    const w = canvas.width, h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!activeAsset) {
      drawIdleFrame();
      return;
    }

    // Update background video reference for chroma key
    updateBgTrack();

    // Draw foreground video frame
    if (activeAsset.type === 'video') {
      if (fgVideoEl && fgVideoEl.readyState >= 2) {
        ctx.drawImage(fgVideoEl, 0, 0, w, h);
      } else if (primaryVideoEl && primaryVideoEl.readyState >= 2) {
        ctx.drawImage(primaryVideoEl, 0, 0, w, h);
      }
    }

    // Effects + Chroma Key pass
    applyEffectsAndKey(fgVideoEl ? fgVideoEl.currentTime : currentTime);

    // Text overlays
    const textCanvas = document.getElementById('text-canvas');
    if (textCanvas) {
      const textCtx = textCanvas.getContext('2d');
      if (textCtx && window.TextEngine) {
        TextEngine.render(textCanvas, textCtx, w, h, currentTime);
      }
    }
  }

  function applyEffectsAndKey(time) {
    const selectedClip = window.AppState ? AppState.selectedClip : null;

    // Apply VFX effects chain
    if (selectedClip && selectedClip.effects && selectedClip.effects.length > 0) {
      const offscreen = document.createElement('canvas');
      offscreen.width = canvas.width;
      offscreen.height = canvas.height;
      const offCtx = offscreen.getContext('2d');
      offCtx.drawImage(canvas, 0, 0);
      const result = window.Effects ? Effects.applyToCanvas(offscreen, selectedClip.effects, time) : offscreen;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(result, 0, 0);
    }

    // Chroma Key / BG Removal pass (composites over background)
    if (window.ChromaKey && ChromaKey.isEnabled()) {
      const result = ChromaKey.processFrame(canvas, time);
      if (result && result !== canvas) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(result, 0, 0);
      }
    }
  }

  // ---- Playback ----
  function play() {
    if (window.AudioEngine) AudioEngine.resume();
    isPlaying = true;
    document.getElementById('play-icon').style.display = 'none';
    document.getElementById('pause-icon').style.display = 'block';
    document.getElementById('btn-play-pause').classList.add('active');

    if (fgVideoEl) {
      fgVideoEl.playbackRate = playbackRate;
      fgVideoEl.play().catch(() => {});
    }
    if (primaryVideoEl && activeAsset && activeAsset.type === 'video') {
      primaryVideoEl.playbackRate = playbackRate;
      primaryVideoEl.play().catch(() => {});
    }
    if (bgVideoEl) {
      bgVideoEl.playbackRate = playbackRate;
      bgVideoEl.play().catch(() => {});
    }

    startRenderLoop();
  }

  function pause() {
    isPlaying = false;
    document.getElementById('play-icon').style.display = 'block';
    document.getElementById('pause-icon').style.display = 'none';
    document.getElementById('btn-play-pause').classList.remove('active');

    if (fgVideoEl) fgVideoEl.pause();
    if (primaryVideoEl) primaryVideoEl.pause();
    if (bgVideoEl) bgVideoEl.pause();
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  function togglePlayPause() { isPlaying ? pause() : play(); }

  function startRenderLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    const loop = (ts) => {
      if (!isPlaying) return;
      if (ts - lastFrameTime >= 1000 / 60) {
        lastFrameTime = ts;
        // Sync currentTime from video element
        if (fgVideoEl && fgVideoEl.readyState >= 2) {
          currentTime = fgVideoEl.currentTime;
        }
        updateTimecode();
        updatePlayheadFromTime();
        renderFrame();

        // Check end
        if (fgVideoEl && fgVideoEl.duration > 0 && fgVideoEl.currentTime >= fgVideoEl.duration) {
          if (looping) {
            fgVideoEl.currentTime = 0;
            if (bgVideoEl) bgVideoEl.currentTime = 0;
          } else {
            pause();
            return;
          }
        }
      }
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
  }

  function seekTo(t) {
    currentTime = Math.max(0, Math.min(duration || 0, t));
    if (fgVideoEl) fgVideoEl.currentTime = currentTime;
    if (primaryVideoEl) primaryVideoEl.currentTime = currentTime;
    if (bgVideoEl) bgVideoEl.currentTime = currentTime;
    updateTimecode();
    renderFrame();
  }

  function stepForward() {
    playbackRate = Math.min(4, playbackRate * 2);
    if (!isPlaying) play();
    if (fgVideoEl) fgVideoEl.playbackRate = playbackRate;
    if (bgVideoEl) bgVideoEl.playbackRate = playbackRate;
  }

  function stepBackward() {
    pause();
    const t = (fgVideoEl ? fgVideoEl.currentTime : currentTime) - 1 / 30;
    seekTo(Math.max(0, t));
  }

  function skipToStart() { pause(); seekTo(0); }
  function skipToEnd() { pause(); seekTo(duration); }

  function updateTimecode() {
    const t = fgVideoEl ? fgVideoEl.currentTime : currentTime;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const f = Math.floor((t % 1) * 30);
    const fmt = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`;
    const tc = document.getElementById('timecode-display');
    if (tc) tc.textContent = fmt;
    const ctd = document.getElementById('current-time-display');
    if (ctd) ctd.textContent = `${h > 0 ? h + ':' : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updateDurationDisplay() {
    const t = duration;
    const h = Math.floor(t / 3600);
    const m = Math.floor((t % 3600) / 60);
    const s = Math.floor(t % 60);
    const dd = document.getElementById('duration-display');
    if (dd) dd.textContent = `${h > 0 ? h + ':' : ''}${String(m).padStart(h > 0 ? 2 : 1, '0')}:${String(s).padStart(2, '0')}`;
  }

  function updatePlayheadFromTime() {
    if (window.AppState) AppState.currentTime = currentTime;
    if (window.Timeline) Timeline.updatePlayheadPosition(currentTime);
  }

  function bindControls() {
    document.getElementById('btn-play-pause').addEventListener('click', togglePlayPause);
    document.getElementById('btn-skip-start').addEventListener('click', skipToStart);
    document.getElementById('btn-skip-end').addEventListener('click', skipToEnd);
    document.getElementById('btn-step-back').addEventListener('click', stepBackward);
    document.getElementById('btn-step-fwd').addEventListener('click', stepForward);

    document.getElementById('btn-loop').addEventListener('click', function () {
      looping = !looping;
      this.classList.toggle('active', looping);
      if (fgVideoEl) fgVideoEl.loop = looping;
    });

    document.getElementById('master-volume').addEventListener('input', function () {
      if (window.AudioEngine) AudioEngine.setMasterVolume(this.value / 100);
    });

    document.getElementById('btn-fullscreen').addEventListener('click', () => {
      const container = document.getElementById('preview-container');
      if (!document.fullscreenElement) container.requestFullscreen().catch(() => {});
      else document.exitFullscreen();
    });

    document.getElementById('btn-safe-area').addEventListener('click', function () {
      const overlay = document.getElementById('safe-area-overlay');
      const vis = overlay.style.display !== 'none';
      overlay.style.display = vis ? 'none' : 'block';
      this.classList.toggle('active', !vis);
    });

    document.querySelectorAll('.res-btn').forEach(btn => {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.res-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        resizeCanvas();
      });
    });
  }

  function getCurrentCanvas() { return canvas; }
  function getVideoElement() { return fgVideoEl || primaryVideoEl; }

  return {
    init, play, pause, togglePlayPause, seekTo, setClip,
    renderFrame, resizeCanvas, getCurrentCanvas, getVideoElement
  };
})();
