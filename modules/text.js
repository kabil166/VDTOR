/* ====================================
   VDTOR — Text & Titles Module
   ==================================== */
'use strict';

const TextEngine = (() => {
  let textLayers = [];
  let selectedTextId = null;
  let textCanvas, textCtx;
  let animTime = 0;
  let currentTime = 0;

  const PRESETS = {
    'lower-third': {
      content: 'Your Name Here',
      font: 'Inter', size: 32, color: '#ffffff',
      bgOn: true, bgColor: '#000000', opacity: 100,
      x: 0.05, y: 0.78, animation: 'slide-up'
    },
    'title': {
      content: 'Episode Title',
      font: 'Outfit', size: 72, color: '#ffffff',
      bgOn: false, bgColor: '#000000', opacity: 100,
      x: 0.5, y: 0.5, animation: 'fade', align: 'center'
    },
    'subtitle': {
      content: 'Subtitle text goes here',
      font: 'Inter', size: 24, color: '#cccccc',
      bgOn: false, bgColor: '#000000', opacity: 80,
      x: 0.5, y: 0.62, animation: 'fade', align: 'center'
    },
    'caption': {
      content: 'Caption text',
      font: 'Inter', size: 20, color: '#ffffff',
      bgOn: true, bgColor: '#000000', opacity: 90,
      x: 0.5, y: 0.88, animation: 'none', align: 'center'
    }
  };

  function genId() { return 'txt_' + Date.now(); }

  function getAll() { return textLayers; }

  function addLayer(config={}) {
    const layer = {
      id: genId(),
      content: config.content || 'New Text',
      font: config.font || 'Inter',
      size: config.size || 48,
      color: config.color || '#ffffff',
      bgOn: config.bgOn || false,
      bgColor: config.bgColor || '#000000',
      opacity: config.opacity !== undefined ? config.opacity : 100,
      x: config.x !== undefined ? config.x : 0.1,
      y: config.y !== undefined ? config.y : 0.5,
      align: config.align || 'left',
      animation: config.animation || 'none',
      inPoint: AppState ? AppState.currentTime : 0,
      outPoint: (AppState ? AppState.currentTime : 0) + 5,
      bold: false, italic: false
    };
    textLayers.push(layer);
    selectLayer(layer.id);
    updateTextPropsUI(layer);
    return layer;
  }

  function removeLayer(id) {
    textLayers = textLayers.filter(l => l.id !== id);
    if (selectedTextId === id) {
      selectedTextId = null;
      document.getElementById('text-props').style.display = 'none';
      document.getElementById('text-props-empty').style.display = 'flex';
    }
  }

  function selectLayer(id) {
    selectedTextId = id;
    const layer = textLayers.find(l => l.id === id);
    if (layer) {
      updateTextPropsUI(layer);
      document.getElementById('text-props').style.display = 'block';
      document.getElementById('text-props-empty').style.display = 'none';
    }
  }

  function updateTextPropsUI(layer) {
    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val; };
    const setTxt = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };

    setVal('text-content', layer.content);
    setVal('text-font', layer.font);
    setVal('text-size', layer.size);
    setTxt('text-size-val', layer.size);
    setVal('text-color', layer.color);
    setVal('text-bg-color', layer.bgColor);
    setVal('text-opacity', layer.opacity);
    setTxt('text-opacity-val', layer.opacity + '%');

    if (document.getElementById('text-bg-on')) {
      document.getElementById('text-bg-on').checked = layer.bgOn;
    }

    document.querySelectorAll('.text-anim-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.anim === layer.animation);
    });
  }

  function applyAnimatedOffset(layer, t) {
    const anim = layer.animation;
    const duration = 0.5;
    const progress = Math.min(1, t / duration);
    const ease = progress < 0.5 ? 2*progress*progress : -1+(4-2*progress)*progress;

    let offsetX = 0, offsetY = 0, alpha = 1, scale = 1;

    switch(anim) {
      case 'fade': alpha = ease; break;
      case 'slide-up': offsetY = (1-ease)*40; alpha = ease; break;
      case 'slide-left': offsetX = (1-ease)*60; alpha = ease; break;
      case 'zoom': scale = 0.5 + ease*0.5; alpha = ease; break;
      case 'bounce':
        const bounce = Math.abs(Math.sin(t * 8)) * Math.max(0, 1-t*2);
        offsetY = -bounce * 20;
        alpha = ease;
        break;
      case 'typewriter': break; // handled in draw
      case 'glitch':
        if (t < 0.5) {
          offsetX = (Math.random()-0.5) * 8 * (1-t*2);
          alpha = Math.random() * 0.3 + 0.7;
        }
        break;
    }

    return { offsetX, offsetY, alpha, scale };
  }

  function render(canvasEl, ctxEl, w, h, time) {
    if (!canvasEl || !ctxEl) return;
    canvasEl.width = w; canvasEl.height = h;
    ctxEl.clearRect(0, 0, w, h);

    textLayers.forEach(layer => {
      if (time < layer.inPoint || time > layer.outPoint) return;

      const t = time - layer.inPoint;
      const { offsetX, offsetY, alpha, scale } = applyAnimatedOffset(layer, t);

      const x = layer.x * w + offsetX;
      const y = layer.y * h + offsetY;
      const fontSize = layer.size * (w / 1920);

      ctxEl.save();
      ctxEl.globalAlpha = (layer.opacity / 100) * alpha;
      ctxEl.font = `${layer.italic?'italic ':''} ${layer.bold?'bold ':''} ${fontSize}px '${layer.font}', sans-serif`;
      ctxEl.textBaseline = 'middle';
      ctxEl.textAlign = layer.align || 'left';

      let displayText = layer.content;
      if (layer.animation === 'typewriter') {
        const chars = Math.floor(t * 20);
        displayText = layer.content.slice(0, chars);
      }

      const metrics = ctxEl.measureText(displayText);
      const textW = metrics.width;
      const textH = fontSize * 1.2;

      // Background
      if (layer.bgOn) {
        ctxEl.fillStyle = layer.bgColor;
        ctxEl.globalAlpha = (layer.opacity / 100) * alpha * 0.8;
        let bgX = x;
        if (layer.align === 'center') bgX = x - textW/2;
        if (layer.align === 'right') bgX = x - textW;
        ctxEl.fillRect(bgX - 8, y - textH/2 - 4, textW + 16, textH + 8);
        ctxEl.globalAlpha = (layer.opacity / 100) * alpha;
      }

      // Shadow
      ctxEl.shadowColor = 'rgba(0,0,0,0.7)';
      ctxEl.shadowBlur = 6;
      ctxEl.shadowOffsetX = 2;
      ctxEl.shadowOffsetY = 2;

      ctxEl.fillStyle = layer.color;
      ctxEl.fillText(displayText, x, y);
      ctxEl.restore();
    });
  }

  function init() {
    textCanvas = document.getElementById('text-canvas');
    textCtx = textCanvas ? textCanvas.getContext('2d') : null;

    // Add text button
    const addBtn = document.getElementById('btn-add-text');
    if (addBtn) addBtn.addEventListener('click', () => addLayer());

    // Preset buttons
    document.querySelectorAll('.text-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = PRESETS[btn.dataset.preset];
        if (preset) addLayer({ ...preset });
        Toast.show(`Text preset applied: ${btn.textContent}`, 'success');
      });
    });

    // Animation buttons
    document.querySelectorAll('.text-anim-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.text-anim-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const layer = textLayers.find(l => l.id === selectedTextId);
        if (layer) layer.animation = btn.dataset.anim;
      });
    });

    // Live text property updates
    const bindTextProp = (inputId, layerProp, transform, valId) => {
      const el = document.getElementById(inputId);
      if (!el) return;
      el.addEventListener('input', () => {
        const layer = textLayers.find(l => l.id === selectedTextId);
        if (!layer) return;
        layer[layerProp] = transform ? transform(el.value) : el.value;
        if (valId) {
          const valEl = document.getElementById(valId);
          if (valEl) valEl.textContent = el.value + (layerProp === 'opacity' ? '%' : '');
        }
      });
    };

    bindTextProp('text-content', 'content', null, null);
    bindTextProp('text-font', 'font', null, null);
    bindTextProp('text-size', 'size', Number, 'text-size-val');
    bindTextProp('text-color', 'color', null, null);
    bindTextProp('text-bg-color', 'bgColor', null, null);
    bindTextProp('text-opacity', 'opacity', Number, 'text-opacity-val');

    const bgToggle = document.getElementById('text-bg-on');
    if (bgToggle) {
      bgToggle.addEventListener('change', () => {
        const layer = textLayers.find(l => l.id === selectedTextId);
        if (layer) layer.bgOn = bgToggle.checked;
      });
    }
  }

  return { init, addLayer, removeLayer, selectLayer, getAll, render };
})();
