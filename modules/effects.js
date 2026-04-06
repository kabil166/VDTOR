/* ====================================
   VDTOR — Effects & VFX Engine
   Canvas 2D + CSS Filter + WebGL
   ==================================== */
'use strict';

const Effects = (() => {

  // Effect definitions with parameters
  const EFFECT_DEFS = {
    brightness: {
      label: 'Brightness / Contrast',
      emoji: '🔆',
      params: [
        { id: 'brightness', label: 'Brightness', min: -100, max: 100, value: 0 },
        { id: 'contrast', label: 'Contrast', min: -100, max: 100, value: 0 }
      ]
    },
    saturation: {
      label: 'Saturation / Hue',
      emoji: '🎨',
      params: [
        { id: 'saturation', label: 'Saturation', min: -100, max: 100, value: 0 },
        { id: 'hue', label: 'Hue Rotate', min: -180, max: 180, value: 0 }
      ]
    },
    exposure: {
      label: 'Exposure',
      emoji: '☀️',
      params: [{ id: 'exposure', label: 'Exposure', min: -100, max: 100, value: 0 }]
    },
    vignette: {
      label: 'Vignette',
      emoji: '⭕',
      params: [
        { id: 'intensity', label: 'Intensity', min: 0, max: 100, value: 50 },
        { id: 'radius', label: 'Radius', min: 10, max: 100, value: 70 }
      ]
    },
    bloom: {
      label: 'Bloom / Glow',
      emoji: '✨',
      params: [
        { id: 'intensity', label: 'Intensity', min: 0, max: 100, value: 50 },
        { id: 'threshold', label: 'Threshold', min: 0, max: 100, value: 60 }
      ]
    },
    lensflare: {
      label: 'Lens Flare',
      emoji: '💡',
      params: [
        { id: 'intensity', label: 'Intensity', min: 0, max: 100, value: 60 },
        { id: 'x', label: 'X Position', min: 0, max: 100, value: 30 },
        { id: 'y', label: 'Y Position', min: 0, max: 100, value: 20 }
      ]
    },
    filmgrain: {
      label: 'Film Grain',
      emoji: '🎞️',
      params: [
        { id: 'intensity', label: 'Intensity', min: 0, max: 100, value: 30 },
        { id: 'size', label: 'Grain Size', min: 1, max: 5, value: 2 }
      ]
    },
    chromatic: {
      label: 'Chromatic Aberration',
      emoji: '🔴',
      params: [{ id: 'offset', label: 'Offset', min: 0, max: 20, value: 4 }]
    },
    glitch: {
      label: 'Glitch',
      emoji: '📺',
      params: [
        { id: 'intensity', label: 'Intensity', min: 0, max: 100, value: 50 },
        { id: 'speed', label: 'Speed', min: 0, max: 100, value: 50 }
      ]
    },
    vhs: {
      label: 'VHS / Retro',
      emoji: '📼',
      params: [{ id: 'intensity', label: 'Intensity', min: 0, max: 100, value: 60 }]
    },
    neon: {
      label: 'Neon Glow',
      emoji: '🌟',
      params: [
        { id: 'intensity', label: 'Intensity', min: 0, max: 100, value: 70 },
        { id: 'color', label: 'Color Shift', min: 0, max: 360, value: 0 }
      ]
    },
    duotone: {
      label: 'Duotone',
      emoji: '🎭',
      params: [
        { id: 'hue1', label: 'Shadow Hue', min: 0, max: 360, value: 240 },
        { id: 'hue2', label: 'Highlight Hue', min: 0, max: 360, value: 30 }
      ]
    },
    bw: {
      label: 'Black & White',
      emoji: '⚫',
      params: [
        { id: 'intensity', label: 'Amount', min: 0, max: 100, value: 100 },
        { id: 'contrast', label: 'Contrast', min: -100, max: 100, value: 0 }
      ]
    },
    blur: {
      label: 'Gaussian Blur',
      emoji: '🌫️',
      params: [{ id: 'radius', label: 'Radius', min: 0, max: 20, value: 3 }]
    },
    motionblur: {
      label: 'Motion Blur',
      emoji: '💨',
      params: [
        { id: 'intensity', label: 'Intensity', min: 0, max: 30, value: 10 },
        { id: 'angle', label: 'Angle', min: 0, max: 360, value: 0 }
      ]
    },
    radialblur: {
      label: 'Radial Blur',
      emoji: '🌀',
      params: [{ id: 'amount', label: 'Amount', min: 0, max: 20, value: 5 }]
    },
    pixelate: {
      label: 'Pixelate',
      emoji: '🔲',
      params: [{ id: 'size', label: 'Pixel Size', min: 2, max: 64, value: 8 }]
    },
    fisheye: {
      label: 'Fisheye',
      emoji: '🐟',
      params: [{ id: 'strength', label: 'Strength', min: -100, max: 100, value: 40 }]
    },
    mirror: {
      label: 'Mirror',
      emoji: '🪞',
      params: [
        { id: 'axis', label: 'Axis H/V', min: 0, max: 1, value: 0 }
      ]
    },
    wavewarp: {
      label: 'Wave Warp',
      emoji: '〰️',
      params: [
        { id: 'amplitude', label: 'Amplitude', min: 0, max: 50, value: 10 },
        { id: 'frequency', label: 'Frequency', min: 1, max: 20, value: 5 }
      ]
    },
    sharpen: {
      label: 'Sharpen',
      emoji: '🔍',
      params: [{ id: 'amount', label: 'Amount', min: 0, max: 100, value: 50 }]
    }
  };

  function getDef(type) {
    return EFFECT_DEFS[type] || null;
  }

  function getAllDefs() { return EFFECT_DEFS; }

  function createEffect(type) {
    const def = EFFECT_DEFS[type];
    if (!def) return null;
    const params = {};
    def.params.forEach(p => { params[p.id] = p.value; });
    return {
      id: 'fx_' + Date.now() + '_' + Math.random().toString(36).slice(2,5),
      type,
      enabled: true,
      params
    };
  }

  // Apply effects chain to a canvas
  function applyToCanvas(srcCanvas, effects, time=0) {
    const w = srcCanvas.width, h = srcCanvas.height;
    const offscreen = document.createElement('canvas');
    offscreen.width = w; offscreen.height = h;
    const ctx = offscreen.getContext('2d');

    // Build CSS filter string
    let filterStr = '';
    let pixelEffects = [];

    effects.forEach(fx => {
      if (!fx.enabled) return;
      const p = fx.params;

      switch(fx.type) {
        case 'brightness':
          filterStr += ` brightness(${1 + p.brightness/100})`;
          filterStr += ` contrast(${1 + p.contrast/100})`;
          break;
        case 'saturation':
          filterStr += ` saturate(${1 + p.saturation/100})`;
          filterStr += ` hue-rotate(${p.hue}deg)`;
          break;
        case 'exposure':
          filterStr += ` brightness(${1 + p.exposure/80})`;
          break;
        case 'blur':
          filterStr += ` blur(${p.radius}px)`;
          break;
        case 'bw':
          filterStr += ` grayscale(${p.intensity/100})`;
          filterStr += ` contrast(${1 + p.contrast/100})`;
          break;
        case 'sharpen':
          // Approximate via contrast
          filterStr += ` contrast(${1 + p.amount/200})`;
          break;
        default:
          pixelEffects.push(fx);
          break;
      }
    });

    ctx.filter = filterStr.trim() || 'none';
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.filter = 'none';

    // Apply pixel-level effects
    if (pixelEffects.length > 0) {
      applyPixelEffects(offscreen, ctx, pixelEffects, time, w, h);
    }

    return offscreen;
  }

  function applyPixelEffects(canvas, ctx, effects, time, w, h) {
    effects.forEach(fx => {
      if (!fx.enabled) return;
      const p = fx.params;

      switch(fx.type) {
        case 'vignette': applyVignette(ctx, w, h, p.intensity/100, p.radius/100); break;
        case 'filmgrain': applyFilmGrain(ctx, w, h, p.intensity/100, time); break;
        case 'chromatic': applyChromatic(canvas, ctx, w, h, p.offset); break;
        case 'glitch': applyGlitch(canvas, ctx, w, h, p.intensity/100, time); break;
        case 'vhs': applyVHS(canvas, ctx, w, h, p.intensity/100, time); break;
        case 'pixelate': applyPixelate(canvas, ctx, w, h, p.size); break;
        case 'neon': applyNeon(canvas, ctx, w, h, p.intensity/100); break;
        case 'bloom': applyBloom(canvas, ctx, w, h, p.intensity/100, p.threshold/100); break;
        case 'lensflare': applyLensFlare(ctx, w, h, p.intensity/100, p.x/100, p.y/100); break;
        case 'motionblur': applyMotionBlur(canvas, ctx, w, h, p.intensity, p.angle); break;
        case 'wavewarp': applyWaveWarp(canvas, ctx, w, h, p.amplitude, p.frequency, time); break;
        case 'duotone': applyDuotone(canvas, ctx, w, h, p.hue1, p.hue2); break;
        case 'mirror': applyMirror(canvas, ctx, w, h, p.axis); break;
        case 'fisheye': applyFisheye(canvas, ctx, w, h, p.strength/100); break;
      }
    });
  }

  function applyVignette(ctx, w, h, intensity, radius) {
    const cx = w/2, cy = h/2;
    const r = Math.max(w,h) * radius * 0.8;
    const grd = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r);
    grd.addColorStop(0, 'rgba(0,0,0,0)');
    grd.addColorStop(1, `rgba(0,0,0,${intensity * 0.8})`);
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, w, h);
  }

  function applyFilmGrain(ctx, w, h, intensity, time) {
    const imageData = ctx.getImageData(0, 0, w, h);
    const data = imageData.data;
    const seed = (time * 30) | 0;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * intensity * 80;
      data[i]   = Math.max(0, Math.min(255, data[i]   + noise));
      data[i+1] = Math.max(0, Math.min(255, data[i+1] + noise));
      data[i+2] = Math.max(0, Math.min(255, data[i+2] + noise));
    }
    ctx.putImageData(imageData, 0, 0);
  }

  function applyChromatic(srcCanvas, ctx, w, h, offset) {
    const temp = document.createElement('canvas');
    temp.width = w; temp.height = h;
    const tc = temp.getContext('2d');

    // Red channel offset
    tc.globalCompositeOperation = 'copy';
    tc.drawImage(srcCanvas, -offset, 0);

    ctx.globalCompositeOperation = 'multiply';
    // This is a simplified approach — proper would use ImageData
    const imgData = ctx.getImageData(0, 0, w, h);
    const shiftData = tc.getImageData(0, 0, w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i] = shiftData.data[i]; // Only take Red from shifted source
    }
    ctx.globalCompositeOperation = 'source-over';

    // Blue channel opposite offset
    const rightShift = ctx.getImageData(0, 0, w, h);
    tc.drawImage(srcCanvas, offset, 0);
    const blueData = tc.getImageData(0, 0, w, h);
    for (let i = 0; i < imgData.data.length; i += 4) {
      imgData.data[i+2] = blueData.data[i+2]; // Only take Blue from right-shifted
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function applyGlitch(srcCanvas, ctx, w, h, intensity, time) {
    const lines = Math.floor(intensity * 8);
    for (let i = 0; i < lines; i++) {
      const y = Math.floor(Math.random() * h);
      const lineH = Math.floor(Math.random() * 6 + 2);
      const offset = (Math.random() - 0.5) * intensity * 40;
      ctx.drawImage(srcCanvas, 0, y, w, lineH, offset, y, w, lineH);
    }

    // RGB split effect
    if (intensity > 0.3 && Math.random() > 0.7) {
      const split = intensity * 10;
      ctx.globalAlpha = 0.4;
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'hue-rotate(120deg)';
      ctx.drawImage(srcCanvas, split, 0);
      ctx.filter = 'none';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  function applyVHS(srcCanvas, ctx, w, h, intensity, time) {
    // Scanlines
    ctx.globalAlpha = intensity * 0.3;
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = `rgba(0,0,0,0.5)`;
      ctx.fillRect(0, y, w, 1);
    }
    ctx.globalAlpha = 1;

    // Color bleed
    ctx.globalAlpha = intensity * 0.15;
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = 'hue-rotate(90deg) blur(2px)';
    ctx.drawImage(srcCanvas, 3, 0);
    ctx.filter = 'none';
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Noise bar (occasionally)
    if (Math.random() > 0.92) {
      const barY = Math.random() * h;
      const barH = Math.random() * 8 + 2;
      ctx.fillStyle = `rgba(200,220,255,${intensity * 0.3})`;
      ctx.fillRect(0, barY, w, barH);
    }
  }

  function applyPixelate(srcCanvas, ctx, w, h, size) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(srcCanvas, 0, 0, w/size, h/size);
    ctx.drawImage(ctx.canvas, 0, 0, w/size, h/size, 0, 0, w, h);
    ctx.imageSmoothingEnabled = true;
  }

  function applyNeon(srcCanvas, ctx, w, h, intensity) {
    // Multi-pass glow
    for (let i = 1; i <= 3; i++) {
      ctx.globalAlpha = intensity * 0.25;
      ctx.filter = `blur(${i * 4}px) saturate(4) brightness(2)`;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(srcCanvas, 0, 0);
    }
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function applyBloom(srcCanvas, ctx, w, h, intensity, threshold) {
    // Simplified bloom — brighten bright areas and blur
    ctx.globalAlpha = intensity * 0.5;
    ctx.filter = `blur(${intensity * 15}px) brightness(${1 + intensity})`;
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(srcCanvas, 0, 0);
    ctx.filter = 'none';
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function applyLensFlare(ctx, w, h, intensity, xPct, yPct) {
    const x = w * xPct, y = h * yPct;
    const maxR = Math.max(w,h) * 0.5;

    // Core glow
    const g1 = ctx.createRadialGradient(x, y, 0, x, y, maxR * 0.15);
    g1.addColorStop(0, `rgba(255,255,220,${intensity * 0.8})`);
    g1.addColorStop(0.3, `rgba(255,200,100,${intensity * 0.3})`);
    g1.addColorStop(1, 'rgba(255,180,50,0)');
    ctx.fillStyle = g1;
    ctx.fillRect(0,0,w,h);

    // Outer corona
    const g2 = ctx.createRadialGradient(x, y, 0, x, y, maxR * 0.6);
    g2.addColorStop(0, `rgba(255,255,200,${intensity * 0.2})`);
    g2.addColorStop(1, 'rgba(255,150,50,0)');
    ctx.fillStyle = g2;
    ctx.fillRect(0,0,w,h);

    // Streak
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = intensity * 0.2;
    ctx.strokeStyle = 'rgba(255,255,200,1)';
    ctx.lineWidth = 1;
    for (let a = 0; a < 360; a += 30) {
      ctx.beginPath();
      ctx.moveTo(0,0);
      const len = maxR * (0.3 + Math.random()*0.4);
      const rad = a * Math.PI/180;
      ctx.lineTo(Math.cos(rad)*len, Math.sin(rad)*len);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function applyMotionBlur(srcCanvas, ctx, w, h, intensity, angle) {
    const rad = angle * Math.PI / 180;
    const dx = Math.cos(rad) * intensity;
    const dy = Math.sin(rad) * intensity;
    const steps = 8;
    ctx.globalAlpha = 0.15;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 1; i < steps; i++) {
      ctx.drawImage(srcCanvas, dx * i/steps, dy * i/steps);
      ctx.drawImage(srcCanvas, -dx * i/steps, -dy * i/steps);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function applyWaveWarp(srcCanvas, ctx, w, h, amplitude, frequency, time) {
    const tempImg = ctx.getImageData(0, 0, w, h);
    const out = ctx.createImageData(w, h);
    const sin = Math.sin;
    const cos = Math.cos;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const srcX = Math.round(x + sin((y / h * frequency * Math.PI * 2) + time) * amplitude);
        const srcY = Math.round(y + cos((x / w * frequency * Math.PI * 2) + time) * amplitude * 0.5);
        const clampX = Math.max(0, Math.min(w-1, srcX));
        const clampY = Math.max(0, Math.min(h-1, srcY));
        const di = (y * w + x) * 4;
        const si = (clampY * w + clampX) * 4;
        out.data[di]   = tempImg.data[si];
        out.data[di+1] = tempImg.data[si+1];
        out.data[di+2] = tempImg.data[si+2];
        out.data[di+3] = tempImg.data[si+3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  function applyDuotone(srcCanvas, ctx, w, h, hue1, hue2) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    // Convert hue to RGB
    function hueToRgb(h) {
      const c = 1, x = c*(1-Math.abs((h/60)%2-1));
      const seg = Math.floor(h/60);
      const t = [[c,x,0],[x,c,0],[0,c,x],[0,x,c],[x,0,c],[c,0,x]][seg%6];
      return t.map(v => v*255);
    }

    const [r1,g1,b1] = hueToRgb(hue1);
    const [r2,g2,b2] = hueToRgb(hue2);

    for (let i = 0; i < data.length; i+=4) {
      const lum = (data[i]*0.299 + data[i+1]*0.587 + data[i+2]*0.114) / 255;
      data[i]   = r1*(1-lum) + r2*lum;
      data[i+1] = g1*(1-lum) + g2*lum;
      data[i+2] = b1*(1-lum) + b2*lum;
    }
    ctx.putImageData(imgData, 0, 0);
  }

  function applyMirror(srcCanvas, ctx, w, h, axis) {
    ctx.save();
    if (axis < 0.5) {
      // Horizontal mirror
      ctx.scale(-1, 1);
      ctx.drawImage(srcCanvas, -w, 0, w, h);
    } else {
      // Vertical mirror
      ctx.scale(1, -1);
      ctx.drawImage(srcCanvas, 0, -h, w, h);
    }
    ctx.restore();
  }

  function applyFisheye(srcCanvas, ctx, w, h, strength) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const src = new Uint8ClampedArray(imgData.data);
    const out = ctx.createImageData(w, h);
    const cx = w/2, cy = h/2;
    const maxR = Math.sqrt(cx*cx + cy*cy);

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - cx) / cx;
        const ny = (y - cy) / cy;
        const r = Math.sqrt(nx*nx + ny*ny);
        let theta = Math.atan2(ny, nx);
        let newR = r;

        if (strength > 0) {
          newR = Math.pow(r, 1 + strength);
        } else {
          newR = Math.sqrt(r) * (1 + strength);
        }

        const srcX = Math.round(cx + newR * Math.cos(theta) * cx);
        const srcY = Math.round(cy + newR * Math.sin(theta) * cy);
        const clampX = Math.max(0, Math.min(w-1, srcX));
        const clampY = Math.max(0, Math.min(h-1, srcY));
        const di = (y * w + x)*4;
        const si = (clampY * w + clampX)*4;
        out.data[di]   = src[si];
        out.data[di+1] = src[si+1];
        out.data[di+2] = src[si+2];
        out.data[di+3] = src[si+3];
      }
    }
    ctx.putImageData(out, 0, 0);
  }

  return { getDef, getAllDefs, createEffect, applyToCanvas, EFFECT_DEFS };
})();
