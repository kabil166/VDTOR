/* ====================================
   VDTOR — Chroma Key & BG Removal Module
   Real-time per-frame pixel manipulation — FIXED v2
   ==================================== */
'use strict';

const ChromaKey = (() => {

  // ---- State ----
  let enabled = false;
  let bgRemoveEnabled = false;
  let keyColor = { r: 0, g: 177, b: 64 };
  let tolerance = 80;    // 0-255 range (was 40, too low)
  let softness = 20;     // softness zone width
  let spillSuppression = 50;
  let bgType = 'track';  // default to compositing over lower tracks
  let bgColor = '#1a1a2e';
  let bgImageEl = null;
  let bgGradient = { color1: '#7c3aed', color2: '#06b6d4', angle: 135 };

  // BG Remove state
  let bgRemoveTolerance = 60;
  let bgRemoveSoftness = 12;
  let bgRemoveIterations = 2;
  let bgSamplePoints = [];

  // Background video source (set by Player for track-based compositing)
  let bgVideoEl = null;

  // Offscreen canvas pool
  let offscreenCanvas = null;
  let offscreenCtx = null;

  // ---- Color Utilities ----
  // Returns 0-255 Euclidean distance in RGB
  function colorDistance(r1, g1, b1, r2, g2, b2) {
    const dr = r1 - r2, dg = g1 - g2, db = b1 - b2;
    // Divide by sqrt(3)*255 to normalize to 0-255 range
    return Math.sqrt((dr * dr + dg * dg + db * db) / 3);
  }

  function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(v =>
      Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
    ).join('');
  }

  // ---- Chroma Key Core ----
  function applyChromaKey(srcCtx, w, h) {
    let imageData;
    try {
      imageData = srcCtx.getImageData(0, 0, w, h);
    } catch (e) {
      console.warn('ChromaKey: getImageData failed (CORS?)', e);
      return;
    }
    const data = imageData.data;
    const { r: kr, g: kg, b: kb } = keyColor;
    const softMin = Math.max(0, tolerance - softness);
    const spill = spillSuppression / 100;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const dist = colorDistance(r, g, b, kr, kg, kb);

      if (dist < tolerance) {
        if (dist <= softMin) {
          // Fully transparent
          data[i + 3] = 0;
        } else {
          // Soft edge
          const alpha = Math.round(((dist - softMin) / Math.max(1, softness)) * 255);
          data[i + 3] = Math.min(data[i + 3], alpha);
        }

        // Spill suppression on semi-transparent edge pixels
        if (spill > 0) {
          const t = Math.max(0, 1 - dist / tolerance);
          if (kg > kr && kg > kb) {
            // Green spill: replace G with avg of R and B
            const avg = (data[i] + data[i + 2]) / 2;
            data[i + 1] = Math.round(data[i + 1] * (1 - spill * t) + avg * spill * t);
          } else if (kb > kr && kb > kg) {
            // Blue spill
            const avg = (data[i] + data[i + 1]) / 2;
            data[i + 2] = Math.round(data[i + 2] * (1 - spill * t) + avg * spill * t);
          }
        }
      }
    }
    srcCtx.putImageData(imageData, 0, 0);
  }

  // ---- Smart Background Removal ----
  function applyBgRemoval(srcCtx, w, h) {
    let imageData;
    try {
      imageData = srcCtx.getImageData(0, 0, w, h);
    } catch (e) {
      return;
    }
    const data = imageData.data;
    const bgColors = sampleBorderColors(data, w, h);
    const alphaMap = new Float32Array(w * h);
    const softMin = Math.max(0, bgRemoveTolerance - bgRemoveSoftness);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        const r = data[idx], g = data[idx + 1], b = data[idx + 2];
        const minDist = Math.min(...bgColors.map(c => colorDistance(r, g, b, c.r, c.g, c.b)));

        if (minDist <= softMin) {
          alphaMap[y * w + x] = 0;
        } else if (minDist < bgRemoveTolerance) {
          alphaMap[y * w + x] = (minDist - softMin) / Math.max(1, bgRemoveSoftness);
        } else {
          alphaMap[y * w + x] = 1;
        }
      }
    }

    if (bgRemoveIterations > 1) {
      floodFillBg(alphaMap, data, w, h, bgColors);
    }

    const refined = refineEdges(alphaMap, w, h);
    for (let i = 0; i < w * h; i++) {
      data[i * 4 + 3] = Math.round(refined[i] * 255);
    }
    srcCtx.putImageData(imageData, 0, 0);
  }

  function sampleBorderColors(data, w, h) {
    const samples = [];
    const step = Math.max(1, Math.floor(Math.min(w, h) / 20));
    for (let x = 0; x < w; x += step) {
      samples.push(getPixel(data, w, x, 0));
      samples.push(getPixel(data, w, x, h - 1));
    }
    for (let y = 0; y < h; y += step) {
      samples.push(getPixel(data, w, 0, y));
      samples.push(getPixel(data, w, w - 1, y));
    }
    bgSamplePoints.forEach(pt => {
      const px = Math.round(pt.x * w);
      const py = Math.round(pt.y * h);
      if (px >= 0 && px < w && py >= 0 && py < h) {
        samples.push(getPixel(data, w, px, py));
      }
    });
    return clusterColors(samples, 6);
  }

  function getPixel(data, w, x, y) {
    const i = (y * w + x) * 4;
    return { r: data[i], g: data[i + 1], b: data[i + 2] };
  }

  function clusterColors(samples, n) {
    if (samples.length <= n) return samples;
    const step = Math.floor(samples.length / n);
    const result = [];
    for (let i = 0; i < n; i++) result.push(samples[i * step]);
    result.push({
      r: samples.reduce((s, c) => s + c.r, 0) / samples.length,
      g: samples.reduce((s, c) => s + c.g, 0) / samples.length,
      b: samples.reduce((s, c) => s + c.b, 0) / samples.length
    });
    return result;
  }

  function floodFillBg(alphaMap, data, w, h, bgColors) {
    const visited = new Uint8Array(w * h);
    const queue = [];
    const threshold = bgRemoveTolerance * 1.2;

    for (let x = 0; x < w; x++) {
      if (alphaMap[x] < 0.5) { queue.push([x, 0]); visited[x] = 1; }
      const bi = (h - 1) * w + x;
      if (alphaMap[bi] < 0.5) { queue.push([x, h - 1]); visited[bi] = 1; }
    }
    for (let y = 0; y < h; y++) {
      if (alphaMap[y * w] < 0.5) { queue.push([0, y]); visited[y * w] = 1; }
      const ri = y * w + w - 1;
      if (alphaMap[ri] < 0.5) { queue.push([w - 1, y]); visited[ri] = 1; }
    }

    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let qi = 0;
    while (qi < queue.length && qi < 80000) {
      const [x, y] = queue[qi++];
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
        const ni = ny * w + nx;
        if (visited[ni]) continue;
        const r = data[ni * 4], g = data[ni * 4 + 1], b = data[ni * 4 + 2];
        const minDist = Math.min(...bgColors.map(c => colorDistance(r, g, b, c.r, c.g, c.b)));
        if (minDist < threshold) {
          visited[ni] = 1;
          alphaMap[ni] = Math.min(alphaMap[ni], minDist / threshold);
          queue.push([nx, ny]);
        }
      }
    }
  }

  function refineEdges(alphaMap, w, h) {
    const refined = new Float32Array(alphaMap);
    const radius = Math.max(1, Math.round(bgRemoveSoftness / 3));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, count = 0;
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
              sum += alphaMap[ny * w + nx]; count++;
            }
          }
        }
        refined[y * w + x] = sum / count;
      }
    }
    return refined;
  }

  // ---- Background Rendering ----
  // Composites the chosen background BEHIND the already-keyed foreground
  function renderBackground(fgCanvas, w, h, time) {
    // Create a composite canvas: bg first, then fg on top
    const compCanvas = document.createElement('canvas');
    compCanvas.width = w; compCanvas.height = h;
    const compCtx = compCanvas.getContext('2d');

    // 1. Draw background
    switch (bgType) {
      case 'track':
        // Use the background video element (lower track) provided by Player
        if (bgVideoEl && bgVideoEl.readyState >= 2) {
          compCtx.drawImage(bgVideoEl, 0, 0, w, h);
        } else {
          // Fallback: dark transparent (user sees checkerboard)
          drawCheckerboard(compCtx, w, h);
        }
        break;

      case 'transparent':
        drawCheckerboard(compCtx, w, h);
        break;

      case 'color':
        compCtx.fillStyle = bgColor;
        compCtx.fillRect(0, 0, w, h);
        break;

      case 'gradient': {
        const angle = bgGradient.angle * Math.PI / 180;
        const x0 = w / 2 - Math.cos(angle) * w / 2;
        const y0 = h / 2 - Math.sin(angle) * h / 2;
        const x1 = w / 2 + Math.cos(angle) * w / 2;
        const y1 = h / 2 + Math.sin(angle) * h / 2;
        const grad = compCtx.createLinearGradient(x0, y0, x1, y1);
        grad.addColorStop(0, bgGradient.color1);
        grad.addColorStop(1, bgGradient.color2);
        compCtx.fillStyle = grad;
        compCtx.fillRect(0, 0, w, h);
        break;
      }

      case 'image':
        if (bgImageEl) {
          compCtx.drawImage(bgImageEl, 0, 0, w, h);
        } else {
          compCtx.fillStyle = '#0d0d20';
          compCtx.fillRect(0, 0, w, h);
        }
        break;

      case 'animated-gradient': {
        const t = (time || 0) * 0.4;
        const g2 = compCtx.createLinearGradient(
          w / 2 + Math.cos(t) * w / 2, h / 2 + Math.sin(t) * h / 2,
          w / 2 - Math.cos(t) * w / 2, h / 2 - Math.sin(t) * h / 2
        );
        g2.addColorStop(0, bgGradient.color1);
        g2.addColorStop(0.5, bgGradient.color2);
        g2.addColorStop(1, bgGradient.color1);
        compCtx.fillStyle = g2;
        compCtx.fillRect(0, 0, w, h);
        break;
      }
    }

    // 2. Draw the keyed foreground on top of the background
    compCtx.drawImage(fgCanvas, 0, 0);

    return compCanvas;
  }

  function drawCheckerboard(ctx, w, h) {
    const size = 16;
    for (let y = 0; y < h; y += size) {
      for (let x = 0; x < w; x += size) {
        ctx.fillStyle = ((x / size + y / size) % 2 === 0) ? '#3a3a4a' : '#2a2a38';
        ctx.fillRect(x, y, size, size);
      }
    }
  }

  // ---- Main entry point called per frame ----
  function processFrame(srcCanvas, time) {
    if (!enabled && !bgRemoveEnabled) return srcCanvas;

    const w = srcCanvas.width, h = srcCanvas.height;
    if (w === 0 || h === 0) return srcCanvas;

    // Copy src to offscreen (so we don't mutate the source)
    if (!offscreenCanvas || offscreenCanvas.width !== w || offscreenCanvas.height !== h) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = w;
      offscreenCanvas.height = h;
      offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
    }
    offscreenCtx.clearRect(0, 0, w, h);
    offscreenCtx.drawImage(srcCanvas, 0, 0);

    // Apply keying (modifies alpha channel on offscreenCanvas)
    if (enabled) {
      applyChromaKey(offscreenCtx, w, h);
    } else if (bgRemoveEnabled) {
      applyBgRemoval(offscreenCtx, w, h);
    }

    // Composite keyed fg over chosen background
    return renderBackground(offscreenCanvas, w, h, time);
  }

  // ---- API for Player to register background video ----
  function setBackgroundVideo(videoElement) {
    bgVideoEl = videoElement;
  }

  // ---- Eyedropper ----
  function sampleColorFromCanvas(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = Math.round((clientX - rect.left) * scaleX);
    const y = Math.round((clientY - rect.top) * scaleY);
    const tmpCtx = canvas.getContext('2d');
    const pixel = tmpCtx.getImageData(x, y, 1, 1).data;
    return { r: pixel[0], g: pixel[1], b: pixel[2] };
  }

  function sampleBgPointFromCanvas(canvas, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    bgSamplePoints.push({
      x: (clientX - rect.left) / rect.width,
      y: (clientY - rect.top) / rect.height
    });
    if (window.Toast) Toast.show(`BG sample added (${bgSamplePoints.length} total)`, 'success');
  }

  // ---- Load BG Image ----
  function loadBgImage(file) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      bgImageEl = new Image();
      bgImageEl.onload = () => {
        bgType = 'image';
        updateBgTypeUI('image');
        if (window.Toast) Toast.show('Background image loaded', 'success');
        resolve(bgImageEl);
      };
      bgImageEl.src = url;
    });
  }

  function updateBgTypeUI(type) {
    bgType = type;
    document.querySelectorAll('.bg-type-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.bg === type)
    );
    document.querySelectorAll('.bg-option-section').forEach(s => {
      s.style.display = s.dataset.for === type ? 'flex' : 'none';
    });
  }

  // ---- UI Init ----
  function init() {
    const ckToggle = document.getElementById('ck-enable');
    if (ckToggle) {
      ckToggle.addEventListener('change', () => {
        enabled = ckToggle.checked;
        bgRemoveEnabled = false;
        const bgrEl = document.getElementById('bgr-enable');
        if (bgrEl) bgrEl.checked = false;
        const bgrCtrl = document.getElementById('bgr-controls');
        if (bgrCtrl) bgrCtrl.style.display = 'none';
        const ckCtrl = document.getElementById('ck-controls');
        if (ckCtrl) ckCtrl.style.display = enabled ? 'flex' : 'none';
        // Update tab badge
        document.querySelector('.ck-tab-btn')?.classList.toggle('ck-active', enabled);
        if (window.Toast) Toast.show(enabled ? '🟢 Chroma Key enabled' : 'Chroma Key disabled');
      });
    }

    const bgrToggle = document.getElementById('bgr-enable');
    if (bgrToggle) {
      bgrToggle.addEventListener('change', () => {
        bgRemoveEnabled = bgrToggle.checked;
        enabled = false;
        const ckEl = document.getElementById('ck-enable');
        if (ckEl) ckEl.checked = false;
        const ckCtrl = document.getElementById('ck-controls');
        if (ckCtrl) ckCtrl.style.display = 'none';
        const bgrCtrl = document.getElementById('bgr-controls');
        if (bgrCtrl) bgrCtrl.style.display = bgRemoveEnabled ? 'flex' : 'none';
        document.querySelector('.ck-tab-btn')?.classList.toggle('ck-active', bgRemoveEnabled);
        if (window.Toast) Toast.show(bgRemoveEnabled ? '✂️ BG Remover enabled' : 'BG Remover disabled');
      });
    }

    // Key color picker
    const ckColorInput = document.getElementById('ck-color-input');
    const ckColorSwatch = document.getElementById('ck-color-swatch');
    if (ckColorInput) {
      ckColorInput.addEventListener('input', () => {
        keyColor = hexToRgb(ckColorInput.value);
        if (ckColorSwatch) ckColorSwatch.style.background = ckColorInput.value;
      });
    }

    // Preset chips
    document.querySelectorAll('.ck-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const hex = btn.dataset.color;
        if (ckColorInput) { ckColorInput.value = hex; }
        keyColor = hexToRgb(hex);
        if (ckColorSwatch) ckColorSwatch.style.background = hex;
        if (window.Toast) Toast.show(`Key: ${btn.title || hex}`, 'success');
      });
    });

    // Eyedropper CK
    const eyedropperBtn = document.getElementById('ck-eyedropper');
    if (eyedropperBtn) {
      let picking = false;
      eyedropperBtn.addEventListener('click', () => {
        picking = !picking;
        eyedropperBtn.classList.toggle('active', picking);
        const cv = document.getElementById('preview-canvas');
        if (cv) cv.style.cursor = picking ? 'crosshair' : '';
        if (window.Toast) Toast.show(picking ? '🎯 Click green screen area in preview' : 'Eyedropper off');
        if (picking && cv) {
          const onPick = (e) => {
            const sampled = sampleColorFromCanvas(cv, e.clientX, e.clientY);
            keyColor = sampled;
            const hex = rgbToHex(sampled.r, sampled.g, sampled.b);
            if (ckColorInput) ckColorInput.value = hex;
            if (ckColorSwatch) ckColorSwatch.style.background = hex;
            if (window.Toast) Toast.show(`Sampled: rgb(${sampled.r},${sampled.g},${sampled.b})`, 'success');
            picking = false;
            eyedropperBtn.classList.remove('active');
            cv.style.cursor = '';
            cv.removeEventListener('click', onPick);
          };
          cv.addEventListener('click', onPick);
        }
      });
    }

    // Sliders CK
    bindSlider('ck-tolerance', v => { tolerance = v; }, 'ck-tolerance-val', '');
    bindSlider('ck-softness', v => { softness = v; }, 'ck-softness-val', '');
    bindSlider('ck-spill', v => { spillSuppression = v; }, 'ck-spill-val', '%');

    // Sliders BGR
    bindSlider('bgr-tolerance', v => { bgRemoveTolerance = v; }, 'bgr-tolerance-val', '');
    bindSlider('bgr-softness', v => { bgRemoveSoftness = v; }, 'bgr-softness-val', '');
    bindSlider('bgr-iterations', v => { bgRemoveIterations = v; }, 'bgr-iterations-val', 'x');

    // Eyedropper BGR
    const bgrEyedropper = document.getElementById('bgr-eyedropper');
    if (bgrEyedropper) {
      let bpick = false;
      bgrEyedropper.addEventListener('click', () => {
        bpick = !bpick;
        bgrEyedropper.classList.toggle('active', bpick);
        const cv = document.getElementById('preview-canvas');
        if (cv) cv.style.cursor = bpick ? 'crosshair' : '';
        if (window.Toast) Toast.show(bpick ? '🎯 Click background area' : 'Eyedropper off');
        if (bpick && cv) {
          const onPick = (e) => {
            sampleBgPointFromCanvas(cv, e.clientX, e.clientY);
            bpick = false;
            bgrEyedropper.classList.remove('active');
            cv.style.cursor = '';
            cv.removeEventListener('click', onPick);
          };
          cv.addEventListener('click', onPick);
        }
      });
    }

    document.getElementById('bgr-clear-samples')?.addEventListener('click', () => {
      bgSamplePoints = [];
      if (window.Toast) Toast.show('Background samples cleared');
    });

    // BG type buttons
    document.querySelectorAll('.bg-type-btn').forEach(btn => {
      btn.addEventListener('click', () => updateBgTypeUI(btn.dataset.bg));
    });

    // Color pickers
    const bgColorInput = document.getElementById('bg-solid-color');
    if (bgColorInput) bgColorInput.addEventListener('input', () => { bgColor = bgColorInput.value; });

    const bgGrad1 = document.getElementById('bg-grad-color1');
    const bgGrad2 = document.getElementById('bg-grad-color2');
    const bgGradAngle = document.getElementById('bg-grad-angle');
    if (bgGrad1) bgGrad1.addEventListener('input', () => { bgGradient.color1 = bgGrad1.value; });
    if (bgGrad2) bgGrad2.addEventListener('input', () => { bgGradient.color2 = bgGrad2.value; });
    if (bgGradAngle) {
      bgGradAngle.addEventListener('input', () => {
        bgGradient.angle = parseInt(bgGradAngle.value);
        const d = document.getElementById('bg-grad-angle-val');
        if (d) d.textContent = bgGradAngle.value + '°';
      });
    }

    // Image upload
    const bgImgInput = document.getElementById('bg-image-file');
    if (bgImgInput) bgImgInput.addEventListener('change', () => {
      if (bgImgInput.files[0]) loadBgImage(bgImgInput.files[0]);
    });
    document.getElementById('btn-load-bg-image')?.addEventListener('click', () => bgImgInput?.click());

    // Init display
    const ckCtrl = document.getElementById('ck-controls');
    const bgrCtrl = document.getElementById('bgr-controls');
    if (ckCtrl) ckCtrl.style.display = 'none';
    if (bgrCtrl) bgrCtrl.style.display = 'none';
    updateBgTypeUI('track');  // default to "Track" bg
  }

  function bindSlider(id, setter, displayId, suffix) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      setter(parseFloat(el.value));
      const d = document.getElementById(displayId);
      if (d) d.textContent = el.value + (suffix || '');
    });
  }

  function isEnabled() { return enabled || bgRemoveEnabled; }

  return {
    init,
    processFrame,
    isEnabled,
    setBackgroundVideo,
    sampleColorFromCanvas,
    updateBgTypeUI
  };
})();
