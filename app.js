/* ====================================
   VDTOR — Main App Bootstrap
   State, UI, Media Library, Init
   ==================================== */
'use strict';

/* =========================================================
   GLOBAL TOAST NOTIFICATION SYSTEM
   ========================================================= */
const Toast = (() => {
  function show(msg, type='info', duration=3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { info:'ℹ️', success:'✅', warning:'⚠️', error:'❌' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
  return { show };
})();

/* =========================================================
   APP STATE
   ========================================================= */
const AppState = (() => {
  const MAX_UNDO = 50;

  const state = {
    currentTime: 0,
    selectedClip: null,
    draggingAsset: null,
    draggingFx: null,
    snapEnabled: true,
    rippleEnabled: false,
    activeTool: 'select',
    projectName: 'Untitled Project',
    undoStack: [],
    redoStack: []
  };

  function pushUndo(action) {
    const snapshot = JSON.stringify(Timeline.getState());
    state.undoStack.push({ action, snapshot });
    if (state.undoStack.length > MAX_UNDO) state.undoStack.shift();
    state.redoStack = [];
  }

  function undo() {
    if (state.undoStack.length === 0) { Toast.show('Nothing to undo', 'warning'); return; }
    const current = JSON.stringify(Timeline.getState());
    state.redoStack.push(current);
    const entry = state.undoStack.pop();
    try { Timeline.loadState(JSON.parse(entry.snapshot)); } catch(e) {}
    Toast.show(`Undo: ${entry.action}`);
  }

  function redo() {
    if (state.redoStack.length === 0) { Toast.show('Nothing to redo', 'warning'); return; }
    state.undoStack.push({ action: 'redo', snapshot: JSON.stringify(Timeline.getState()) });
    const snapshot = state.redoStack.pop();
    try { Timeline.loadState(JSON.parse(snapshot)); } catch(e) {}
    Toast.show('Redo');
  }

  function saveProject() {
    const data = { projectName: state.projectName, timeline: Timeline.getState() };
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (state.projectName || 'project') + '.vdtor';
    a.click();
    URL.revokeObjectURL(url);
    Toast.show('Project saved', 'success');
  }

  async function openProject() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.vdtor,.json';
    input.onchange = async () => {
      if (!input.files[0]) return;
      try {
        const text = await input.files[0].text();
        const data = JSON.parse(text);
        if (data.timeline) Timeline.loadState(data.timeline);
        if (data.projectName) state.projectName = data.projectName;
        Toast.show('Project loaded', 'success');
      } catch(e) {
        Toast.show('Failed to load project', 'error');
      }
    };
    input.click();
  }

  // Expose as direct properties for easy access
  return Object.assign(state, { pushUndo, undo, redo, saveProject, openProject });
})();

/* =========================================================
   PANEL TAB SYSTEM
   ========================================================= */
function initPanelTabs() {
  document.querySelectorAll('.ptab').forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset.tab;
      const panel = tab.closest('.panel');
      if (!panel) return;

      panel.querySelectorAll('.ptab').forEach(t => t.classList.remove('active'));
      panel.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('active'));

      tab.classList.add('active');
      const content = document.getElementById(tabId);
      if (content) content.classList.add('active');
    });
  });
}

/* =========================================================
   MEDIA BIN UI
   ========================================================= */
function initMediaBinUI() {
  AssetManager.setOnAssetAdded((asset) => {
    renderAssetThumb(asset);
    // Auto-add to first video track if it's the first asset
    const tracks = Timeline.getTracks();
    const videoTrack = tracks.find(t => t.type === 'video' && t.clips.length === 0);
    if (videoTrack && tracks[0].clips.length === 0 && AssetManager.getAll().length === 1) {
      Timeline.addClipToTrack(videoTrack.id, asset);
      Player.setClip(null, asset);
    }
  });
}

function renderAssetThumb(asset) {
  const grid = document.getElementById('media-grid');
  if (!grid) return;

  const thumb = document.createElement('div');
  thumb.className = 'media-thumb';
  thumb.draggable = true;
  thumb.dataset.assetId = asset.id;
  thumb.title = asset.name;

  // Thumbnail
  if (asset.thumbnail) {
    const img = document.createElement('img');
    img.src = asset.thumbnail;
    thumb.appendChild(img);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = 160; canvas.height = 90;
    const ctx = canvas.getContext('2d');
    const grad = ctx.createLinearGradient(0,0,160,90);
    grad.addColorStop(0, '#1a1a40');
    grad.addColorStop(1, '#0a2040');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,160,90);
    const icons = { video:'🎬', audio:'🎵', image:'🖼️' };
    ctx.font = '32px serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(icons[asset.type] || '📄', 80, 45);
    thumb.appendChild(canvas);
  }

  // Type badge
  const typeBadge = document.createElement('div');
  typeBadge.className = 'media-thumb-type';
  typeBadge.textContent = asset.type === 'video' ? '🎬' : asset.type === 'audio' ? '🎵' : '🖼️';
  thumb.appendChild(typeBadge);

  // Duration badge
  if (asset.duration) {
    const dur = document.createElement('div');
    dur.className = 'media-thumb-duration';
    dur.textContent = AssetManager.formatDuration(asset.duration);
    thumb.appendChild(dur);
  }

  // Label
  const label = document.createElement('div');
  label.className = 'media-thumb-label';
  label.textContent = asset.name.replace(/\.[^/.]+$/, '');
  thumb.appendChild(label);

  // Drag to timeline
  thumb.addEventListener('dragstart', (e) => {
    AppState.draggingAsset = asset.id;
    e.dataTransfer.effectAllowed = 'copy';
    thumb.style.opacity = '0.7';
  });
  thumb.addEventListener('dragend', () => {
    AppState.draggingAsset = null;
    thumb.style.opacity = '1';
  });

  // Double click to preview
  thumb.addEventListener('dblclick', () => {
    Player.setClip(null, asset);
    Toast.show(`Preview: ${asset.name}`);
  });

  // Single click to select
  thumb.addEventListener('click', () => {
    document.querySelectorAll('.media-thumb').forEach(t => t.style.outline = '');
    thumb.style.outline = '2px solid var(--violet)';
  });

  grid.appendChild(thumb);
}

/* =========================================================
   EFFECTS PANEL BINDINGS
   ========================================================= */
function initEffectsUI() {
  // Add effect from menu
  document.querySelectorAll('.effect-add').forEach(item => {
    item.addEventListener('click', () => {
      Timeline.addEffectToSelected(item.dataset.effect);
    });
  });

  // Add effect from FX library (drag not yet impl, click to add)
  document.querySelectorAll('.fx-item').forEach(item => {
    item.addEventListener('click', () => {
      Timeline.addEffectToSelected(item.dataset.effect);
    });
    item.addEventListener('dragstart', (e) => {
      AppState.draggingFx = item.dataset.effect;
      e.dataTransfer.effectAllowed = 'copy';
    });
    item.addEventListener('dragend', () => {
      AppState.draggingFx = null;
    });
  });

  // Inspector Add effect button
  document.getElementById('btn-add-effect')?.addEventListener('click', () => {
    // Switch to FX library tab in media bin
    const fxTab = document.querySelector('[data-tab="media-effects"]');
    if (fxTab) fxTab.click();
    Toast.show('Select an effect from the FX Library');
  });

  // Clip property sliders
  const bindProp = (id, displayId, apply) => {
    const slider = document.getElementById(id);
    const display = document.getElementById(displayId);
    if (!slider) return;
    slider.addEventListener('input', () => {
      apply(parseFloat(slider.value));
      if (display) display.textContent = slider.value + slider.title;
    });
  };

  document.getElementById('prop-opacity')?.addEventListener('input', function() {
    if (AppState.selectedClip) {
      AppState.selectedClip.opacity = this.value / 100;
      document.getElementById('prop-opacity-val').textContent = this.value + '%';
      Player.renderFrame();
    }
  });
  document.getElementById('prop-speed')?.addEventListener('input', function() {
    if (AppState.selectedClip) {
      AppState.selectedClip.speed = this.value / 100;
      document.getElementById('prop-speed-val').textContent = (this.value/100).toFixed(2) + 'x';
    }
  });
  document.getElementById('prop-scale')?.addEventListener('input', function() {
    if (AppState.selectedClip) {
      AppState.selectedClip.scale = this.value / 100;
      document.getElementById('prop-scale-val').textContent = this.value + '%';
      Player.renderFrame();
    }
  });
  document.getElementById('prop-rotation')?.addEventListener('input', function() {
    if (AppState.selectedClip) {
      AppState.selectedClip.rotation = parseFloat(this.value);
      document.getElementById('prop-rotation-val').textContent = this.value + '°';
      Player.renderFrame();
    }
  });
}

/* =========================================================
   TRANSITIONS UI
   ========================================================= */
function initTransitionsUI() {
  document.querySelectorAll('.tr-item').forEach(item => {
    item.addEventListener('click', () => {
      if (!AppState.selectedClip) {
        Toast.show('Select a clip to apply transition', 'warning');
        return;
      }
      AppState.selectedClip.transition = item.dataset.transition;
      const def = Transitions.getDef(item.dataset.transition);
      Toast.show(`Transition applied: ${def?.label || item.dataset.transition}`, 'success');
    });
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('transition', item.dataset.transition);
      e.dataTransfer.effectAllowed = 'copy';
    });
  });
}

/* =========================================================
   MENU ACTIONS
   ========================================================= */
function initMenuActions() {
  // File menu
  document.getElementById('btn-new-project')?.addEventListener('click', () => {
    if (confirm('Start a new project? Unsaved changes will be lost.')) {
      location.reload();
    }
  });

  document.getElementById('btn-save-project')?.addEventListener('click', () => {
    AppState.saveProject();
  });

  document.getElementById('btn-open-project')?.addEventListener('click', () => {
    AppState.openProject();
  });

  document.getElementById('btn-import-media')?.addEventListener('click', () => {
    document.getElementById('file-input').click();
  });

  document.getElementById('btn-export')?.addEventListener('click', () => {
    ExportEngine.openModal();
  });

  // Edit menu
  document.getElementById('btn-undo')?.addEventListener('click', () => AppState.undo());
  document.getElementById('btn-redo')?.addEventListener('click', () => AppState.redo());
  document.getElementById('btn-cut-clip')?.addEventListener('click', () => Timeline.splitAtPlayhead());
  document.getElementById('btn-delete-clip')?.addEventListener('click', () => Timeline.deleteSelected());

  // View menu panel toggles
  ['btn-panel-effects','btn-panel-color','btn-panel-audio','btn-panel-text'].forEach((btnId, i) => {
    const tabMap = ['insp-effects','insp-color','insp-audio-mix','insp-text'];
    document.getElementById(btnId)?.addEventListener('click', () => {
      const tab = document.querySelector(`.ptab[data-tab="${tabMap[i]}"]`);
      if (tab) tab.click();
    });
  });

  document.getElementById('btn-fullscreen-preview')?.addEventListener('click', () => {
    document.getElementById('preview-container').requestFullscreen?.();
  });

  // Tool buttons
  document.getElementById('tool-select')?.addEventListener('click', () => setActiveTool('select'));
  document.getElementById('tool-razor')?.addEventListener('click', () => setActiveTool('razor'));
  document.getElementById('tool-text')?.addEventListener('click', () => setActiveTool('text'));
  document.getElementById('tool-hand')?.addEventListener('click', () => setActiveTool('hand'));

  // FX search
  document.getElementById('fx-search-input')?.addEventListener('input', function() {
    const q = this.value.toLowerCase();
    document.querySelectorAll('.fx-item').forEach(item => {
      const match = item.textContent.toLowerCase().includes(q);
      item.style.display = match ? '' : 'none';
    });
    document.querySelectorAll('.fx-category').forEach(cat => {
      cat.style.display = '';
    });
  });
}

function setActiveTool(tool) {
  AppState.activeTool = tool;
  document.querySelectorAll('.tool-btn').forEach(btn => btn.classList.remove('active'));
  const toolEl = document.getElementById(`tool-${tool}`);
  if (toolEl) toolEl.classList.add('active');
}

/* =========================================================
   KEYBOARD SHORTCUTS
   ========================================================= */
function initKeyboardShortcuts() {
  Keyboard.register('space', () => Player.togglePlayPause());
  Keyboard.register('mod+z', () => AppState.undo());
  Keyboard.register('mod+y', () => AppState.redo());
  Keyboard.register('mod+shift+z', () => AppState.redo());
  Keyboard.register('mod+s', () => AppState.saveProject());
  Keyboard.register('v', () => setActiveTool('select'));
  Keyboard.register('r', () => setActiveTool('razor'));
  Keyboard.register('t', () => {
    setActiveTool('text');
    TextEngine.addLayer();
    document.querySelector('[data-tab="insp-text"]')?.click();
    Toast.show('Text layer added');
  });
  Keyboard.register('i', () => Toast.show('In point set at ' + AppState.currentTime.toFixed(2) + 's'));
  Keyboard.register('o', () => Toast.show('Out point set at ' + AppState.currentTime.toFixed(2) + 's'));
  Keyboard.register('j', () => Player.stepBackward());
  Keyboard.register('k', () => Player.pause());
  Keyboard.register('l', () => Player.stepForward());
  Keyboard.register('f', () => {
    const c = document.getElementById('preview-container');
    document.fullscreenElement ? document.exitFullscreen() : c.requestFullscreen?.();
  });
  Keyboard.register('?', () => {
    document.getElementById('shortcuts-modal').style.display = 'flex';
  });
  Keyboard.register('escape', () => {
    document.getElementById('shortcuts-modal').style.display = 'none';
    document.getElementById('export-modal').style.display = 'none';
  });

  // Close shortcuts modal
  document.getElementById('btn-close-shortcuts')?.addEventListener('click', () => {
    document.getElementById('shortcuts-modal').style.display = 'none';
  });
}

/* =========================================================
   PANEL RESIZE SYSTEM
   ========================================================= */
function initPanelResize() {
  const initResize = (handleId, isHorizontal, panelA, panelB) => {
    const handle = document.getElementById(handleId);
    if (!handle) return;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      handle.classList.add('dragging');

      const startPos = isHorizontal ? e.clientX : e.clientY;
      const startA = isHorizontal ? panelA.offsetWidth : panelA.offsetHeight;
      const startB = isHorizontal ? panelB.offsetWidth : panelB.offsetHeight;

      const onMove = (e2) => {
        const delta = isHorizontal ? (e2.clientX - startPos) : (e2.clientY - startPos);
        const newA = Math.max(150, startA + delta);
        const newB = Math.max(200, startB - delta);

        if (isHorizontal) {
          panelA.style.width = newA + 'px';
          panelA.style.flex = 'none';
          panelB.style.flex = '1';
        } else {
          panelA.style.height = newA + 'px';
          panelA.style.flex = 'none';
        }
      };

      const onUp = () => {
        handle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  };

  initResize('resize-media-preview', true, document.getElementById('panel-media'), document.getElementById('panel-preview'));
  initResize('resize-preview-inspector', true, document.getElementById('panel-preview'), document.getElementById('panel-inspector'));

  // Vertical resize (workspace / timeline)
  const vHandle = document.getElementById('resize-workspace-timeline');
  if (vHandle) {
    vHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      vHandle.classList.add('dragging');
      const startY = e.clientY;
      const workspace = document.getElementById('workspace');
      const timeline = document.getElementById('panel-timeline');
      const startTlH = timeline.offsetHeight;
      const startWsH = workspace.offsetHeight;

      const onMove = (e2) => {
        const delta = startY - e2.clientY; // dragging up = bigger timeline
        const newTlH = Math.max(120, Math.min(500, startTlH + delta));
        timeline.style.height = newTlH + 'px';
      };
      const onUp = () => {
        vHandle.classList.remove('dragging');
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }
}

/* =========================================================
   SPLASH SCREEN / BOOT SEQUENCE
   ========================================================= */
async function boot() {
  const splash = document.getElementById('splash-screen');
  const progress = document.getElementById('splash-progress');
  const status = document.getElementById('splash-status');

  const steps = [
    [10, 'Initializing audio engine…'],
    [20, 'Loading effects library…'],
    [35, 'Building timeline…'],
    [50, 'Setting up color grading…'],
    [62, 'Loading chroma key engine…'],
    [74, 'Initializing player…'],
    [86, 'Starting export engine…'],
    [95, 'Loading UI…'],
    [100, 'Ready!']
  ];

  for (const [pct, msg] of steps) {
    progress.style.width = pct + '%';
    status.textContent = msg;
    await delay(150 + Math.random() * 100);
  }

  await delay(300);
  splash.classList.add('hidden');
  document.getElementById('app').style.display = 'flex';

  // Init all modules
  Keyboard.init();
  AssetManager.init();
  ColorGrade.init();
  TextEngine.init();
  ChromaKey.init();
  Player.init();
  Timeline.init();
  ExportEngine.init();

  // Init UI systems
  initPanelTabs();
  initMediaBinUI();
  initEffectsUI();
  initTransitionsUI();
  initMenuActions();
  initKeyboardShortcuts();
  initPanelResize();

  // Fully remove splash after animation
  setTimeout(() => splash.remove(), 1000);

  Toast.show('Welcome to VDTOR 🎬 — Drop media to start editing!', 'info', 5000);
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Boot on load
document.addEventListener('DOMContentLoaded', boot);
