/* ====================================
   VDTOR — Timeline Engine
   Multi-track, drag/drop, trimming
   ==================================== */
'use strict';

const Timeline = (() => {
  let tracks = [];
  let zoom = 20; // pixels per second
  let scrollLeft = 0;
  let totalDuration = 0;
  let selectedClip = null;
  let selectedTrack = null;
  let playheadTime = 0;

  // Track defaults
  const DEFAULT_TRACKS = [
    { id: 'v1', name: 'Video 1', type: 'video', clips: [], volume: 1, muted: false, solo: false, locked: false },
    { id: 'v2', name: 'Video 2', type: 'video', clips: [], volume: 1, muted: false, solo: false, locked: false },
    { id: 'a1', name: 'Audio 1', type: 'audio', clips: [], volume: 1, muted: false, solo: false, locked: false },
    { id: 'a2', name: 'Audio 2', type: 'audio', clips: [], volume: 1, muted: false, solo: false, locked: false },
  ];

  function generateClipId() { return 'clip_' + Date.now() + '_' + Math.random().toString(36).slice(2,5); }

  function getTracks() { return tracks; }
  function getSelectedClip() { return selectedClip; }

  function init() {
    tracks = DEFAULT_TRACKS.map(t => ({...t, clips: []}));
    renderTrackLabels();
    renderTracks();
    initRuler();
    initPlayheadDrag();
    initZoom();
    initContextMenu();

    document.getElementById('btn-tl-add-video-track').addEventListener('click', () => addTrack('video'));
    document.getElementById('btn-tl-add-audio-track').addEventListener('click', () => addTrack('audio'));

    document.getElementById('btn-tl-snap').addEventListener('click', function() {
      const active = this.dataset.active === 'true';
      this.dataset.active = String(!active);
      AppState.snapEnabled = !active;
      this.classList.toggle('active', !active);
    });
    document.getElementById('btn-tl-ripple').addEventListener('click', function() {
      const active = this.dataset.active === 'true';
      this.dataset.active = String(!active);
      AppState.rippleEnabled = !active;
      this.classList.toggle('active', !active);
    });

    // Keyboard shortcuts for timeline
    Keyboard.register('s', () => splitAtPlayhead());
    Keyboard.register('delete', () => deleteSelected());
    Keyboard.register('backspace', () => deleteSelected());

    // Set snap active by default
    const snapBtn = document.getElementById('btn-tl-snap');
    if (snapBtn) snapBtn.classList.add('active');
  }

  function addTrack(type) {
    const idx = tracks.filter(t => t.type === type).length + 1;
    const track = {
      id: `${type[0]}${idx + 4}`,
      name: `${type === 'video' ? 'Video' : 'Audio'} ${idx}`,
      type,
      clips: [], volume: 1, muted: false, solo: false, locked: false
    };
    tracks.push(track);
    renderTrackLabels();
    renderTracks();
    Toast.show(`${type === 'video' ? 'Video' : 'Audio'} track added`);
  }

  function addClipToTrack(trackId, asset, startTime=null) {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return null;

    // Find non-overlapping start position
    if (startTime === null) {
      startTime = getNextAvailableTime(track);
    }

    const clip = {
      id: generateClipId(),
      assetId: asset.id,
      name: asset.name.replace(/\.[^/.]+$/, ''),
      type: asset.type,
      startTime,
      duration: asset.duration || 5,
      inPoint: 0,
      outPoint: asset.duration || 5,
      effects: [],
      transition: null,
      transitionDuration: 0.5,
      opacity: 1,
      speed: 1,
      scale: 1,
      rotation: 0,
      volume: 1
    };

    track.clips.push(clip);
    track.clips.sort((a,b) => a.startTime - b.startTime);

    updateTotalDuration();
    renderTrackClips(track);
    updateAudioMixer();
    Toast.show(`Added "${clip.name}" to ${track.name}`, 'success');
    return clip;
  }

  function getNextAvailableTime(track) {
    if (track.clips.length === 0) return 0;
    const last = track.clips[track.clips.length - 1];
    return last.startTime + last.duration;
  }

  function updateTotalDuration() {
    let max = 30; // minimum 30s
    tracks.forEach(track => {
      track.clips.forEach(clip => {
        max = Math.max(max, clip.startTime + clip.duration);
      });
    });
    totalDuration = max + 10;
    updateRuler();
  }

  function renderTrackLabels() {
    const container = document.getElementById('timeline-track-labels');
    if (!container) return;
    container.innerHTML = '';

    tracks.forEach((track, idx) => {
      const div = document.createElement('div');
      div.className = `track-label${track.type === 'audio' ? ' audio' : ''}`;
      div.dataset.trackId = track.id;

      div.innerHTML = `
        <span class="track-label-name">${track.name}</span>
        <button class="track-btn ${track.muted ? 'active-mute' : ''}" title="Mute" data-action="mute" data-trackid="${track.id}">M</button>
        <button class="track-btn ${track.solo ? 'active-solo' : ''}" title="Solo" data-action="solo" data-trackid="${track.id}">S</button>
        <button class="track-btn ${track.locked ? 'active-lock' : ''}" title="Lock" data-action="lock" data-trackid="${track.id}">🔒</button>
      `;

      div.querySelectorAll('.track-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const action = btn.dataset.action;
          const tid = btn.dataset.trackid;
          const t = tracks.find(tr => tr.id === tid);
          if (!t) return;
          if (action === 'mute') { t.muted = !t.muted; btn.classList.toggle('active-mute', t.muted); }
          if (action === 'solo') { t.solo = !t.solo; btn.classList.toggle('active-solo', t.solo); }
          if (action === 'lock') { t.locked = !t.locked; btn.classList.toggle('active-lock', t.locked); }
        });
      });

      container.appendChild(div);
    });
  }

  function renderTracks() {
    const container = document.getElementById('timeline-tracks-container');
    if (!container) return;
    container.innerHTML = '';
    updateRuler();

    tracks.forEach(track => {
      const div = document.createElement('div');
      div.className = `timeline-track${track.type === 'audio' ? ' audio' : ''}`;
      div.dataset.trackId = track.id;
      div.style.minWidth = (totalDuration * zoom) + 'px';

      // Drop target for media
      div.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!AppState.draggingAsset && !AppState.draggingFx) return;
        div.classList.add('drag-target');
      });
      div.addEventListener('dragleave', () => div.classList.remove('drag-target'));
      div.addEventListener('drop', (e) => {
        e.preventDefault();
        div.classList.remove('drag-target');
        const rect = div.getBoundingClientRect();
        const x = e.clientX - rect.left + div.parentElement.scrollLeft;
        const dropTime = x / zoom;

        if (AppState.draggingAsset) {
          const asset = AssetManager.getById(AppState.draggingAsset);
          if (asset) addClipToTrack(track.id, asset, Math.max(0, dropTime));
          AppState.draggingAsset = null;
        }
      });

      container.appendChild(div);
      renderTrackClips(track);
    });

    updateWidth();
  }

  function renderTrackClips(track) {
    const trackEl = document.querySelector(`.timeline-track[data-track-id="${track.id}"]`);
    if (!trackEl) return;
    trackEl.innerHTML = '';
    trackEl.style.minWidth = Math.max(totalDuration * zoom, 500) + 'px';

    track.clips.forEach(clip => {
      const clipEl = createClipElement(clip, track);
      trackEl.appendChild(clipEl);
    });
  }

  function createClipElement(clip, track) {
    const div = document.createElement('div');
    div.className = 'timeline-clip';
    div.dataset.clipId = clip.id;
    div.dataset.trackId = track.id;

    div.style.left = (clip.startTime * zoom) + 'px';
    div.style.width = (clip.duration * zoom) + 'px';

    // Color background
    const bg = document.createElement('div');
    bg.className = `clip-${clip.type || 'video'}-bg`;
    div.appendChild(bg);

    // Waveform for audio
    if (clip.type === 'audio' || track.type === 'audio') {
      const waveCanvas = document.createElement('canvas');
      waveCanvas.className = 'clip-waveform';
      waveCanvas.width = Math.max(1, clip.duration * zoom);
      waveCanvas.height = 36;
      div.appendChild(waveCanvas);
      const asset = AssetManager.getById(clip.assetId);
      if (asset) AudioEngine.renderClipWaveform(div, asset.url);
      else AudioEngine.drawPlaceholderWaveform(waveCanvas);
    }

    // Label
    const label = document.createElement('div');
    label.className = 'clip-label';
    label.textContent = clip.name;
    div.appendChild(label);

    // Trim handles
    ['left','right'].forEach(side => {
      const handle = document.createElement('div');
      handle.className = `clip-trim-handle ${side}`;
      div.appendChild(handle);
      initTrimHandle(handle, div, clip, track, side);
    });

    // Click to select
    div.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      if (track.locked) return;

      selectClip(clip, track);

      // Drag clip
      if (!e.target.classList.contains('clip-trim-handle')) {
        initClipDrag(e, div, clip, track);
      }
    });

    // Double-click to preview
    div.addEventListener('dblclick', () => {
      const asset = AssetManager.getById(clip.assetId);
      if (asset) {
        Player.setClip(clip, asset);
        Toast.show(`Preview: ${clip.name}`);
      }
    });

    // Context menu
    div.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectClip(clip, track);
      showContextMenu(e.clientX, e.clientY, clip, track);
    });

    return div;
  }

  function selectClip(clip, track) {
    selectedClip = clip;
    selectedTrack = track;

    // Update AppState
    if (AppState) AppState.selectedClip = clip;

    // Highlight in DOM
    document.querySelectorAll('.timeline-clip.selected').forEach(el => el.classList.remove('selected'));
    const clipEl = document.querySelector(`.timeline-clip[data-clip-id="${clip.id}"]`);
    if (clipEl) clipEl.classList.add('selected');

    // Show effects panel
    updateEffectsPanel(clip);

    // Update clip properties
    updateClipPropertiesPanel(clip);
  }

  function updateEffectsPanel(clip) {
    const noClip = document.getElementById('effects-no-clip');
    const stack = document.getElementById('effects-stack');
    if (!noClip || !stack) return;
    noClip.style.display = 'none';
    stack.style.display = 'flex';
    renderEffectsList(clip);
  }

  function renderEffectsList(clip) {
    const list = document.getElementById('effects-list');
    if (!list) return;
    list.innerHTML = '';

    clip.effects.forEach((fx, i) => {
      const def = Effects.getDef(fx.type);
      const item = document.createElement('div');
      item.className = 'effect-item';
      item.innerHTML = `
        <span class="effect-name">${def ? def.emoji + ' ' + def.label : fx.type}</span>
        <label class="toggle effect-toggle" title="Enable/Disable">
          <input type="checkbox" ${fx.enabled?'checked':''} data-fxid="${fx.id}"/>
          <span class="toggle-knob"></span>
        </label>
        <span class="effect-remove" data-fxid="${fx.id}" title="Remove">×</span>
      `;

      item.querySelector('.effect-toggle input').addEventListener('change', (e) => {
        fx.enabled = e.target.checked;
        Player.renderFrame();
      });
      item.querySelector('.effect-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        clip.effects = clip.effects.filter(f => f.id !== fx.id);
        renderEffectsList(clip);
        Player.renderFrame();
      });

      item.addEventListener('click', () => {
        document.querySelectorAll('.effect-item').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
        showEffectParams(fx, clip);
      });

      list.appendChild(item);
    });

    // Show params inline if one effect
    if (clip.effects.length === 1) {
      showEffectParams(clip.effects[0], clip);
    }
  }

  function showEffectParams(fx, clip) {
    const existing = document.querySelectorAll('.effect-params');
    existing.forEach(el => el.remove());

    const def = Effects.getDef(fx.type);
    if (!def || !def.params || def.params.length === 0) return;

    const paramsDiv = document.createElement('div');
    paramsDiv.className = 'effect-params';
    paramsDiv.innerHTML = `<div class="effect-param-title">${def.emoji} ${def.label}</div>`;

    def.params.forEach(param => {
      const row = document.createElement('div');
      row.className = 'prop-row';
      const val = fx.params[param.id] !== undefined ? fx.params[param.id] : param.value;
      row.innerHTML = `
        <label>${param.label}</label>
        <input type="range" class="prop-slider" min="${param.min}" max="${param.max}" value="${val}" step="${param.id==='size'?1:0.5}"/>
        <span class="prop-val">${val}</span>
      `;
      const slider = row.querySelector('input');
      const display = row.querySelector('.prop-val');
      slider.addEventListener('input', () => {
        fx.params[param.id] = parseFloat(slider.value);
        display.textContent = slider.value;
        Player.renderFrame();
      });
      paramsDiv.appendChild(row);
    });

    const list = document.getElementById('effects-list');
    if (list && list.parentNode) {
      list.parentNode.insertBefore(paramsDiv, list.nextSibling);
    }
  }

  function updateClipPropertiesPanel(clip) {
    const setSlider = (id, val, displayId, suffix='') => {
      const slider = document.getElementById(id);
      const display = document.getElementById(displayId);
      if (slider) slider.value = val;
      if (display) display.textContent = val + suffix;
    };
    setSlider('prop-opacity', Math.round(clip.opacity * 100), 'prop-opacity-val', '%');
    setSlider('prop-speed', Math.round(clip.speed * 100), 'prop-speed-val', 'x');
    setSlider('prop-scale', Math.round(clip.scale * 100), 'prop-scale-val', '%');
    setSlider('prop-rotation', clip.rotation, 'prop-rotation-val', '°');
  }

  function initTrimHandle(handle, div, clip, track, side) {
    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      const startX = e.clientX;
      const startDuration = clip.duration;
      const startTime = clip.startTime;

      const onMove = (e2) => {
        const dx = e2.clientX - startX;
        const dt = dx / zoom;

        if (side === 'right') {
          clip.duration = Math.max(0.1, startDuration + dt);
          div.style.width = (clip.duration * zoom) + 'px';
        } else {
          const newStart = Math.max(0, startTime + dt);
          const newDur = startDuration - (newStart - startTime);
          if (newDur > 0.1) {
            clip.startTime = newStart;
            clip.duration = newDur;
            div.style.left = (clip.startTime * zoom) + 'px';
            div.style.width = (clip.duration * zoom) + 'px';
          }
        }
        updateTotalDuration();
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        AppState.pushUndo('trim');
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function initClipDrag(e, div, clip, track) {
    const startX = e.clientX;
    const startTime = clip.startTime;
    let moved = false;

    const onMove = (e2) => {
      moved = true;
      const dx = e2.clientX - startX;
      const dt = dx / zoom;
      const newTime = Math.max(0, startTime + dt);
      clip.startTime = AppState.snapEnabled ? snapToGrid(newTime) : newTime;
      div.style.left = (clip.startTime * zoom) + 'px';
      updateTotalDuration();
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (moved) AppState.pushUndo('move');
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function snapToGrid(time) {
    const gridSize = 1/zoom * 10; // snap to ~0.5s
    return Math.round(time / gridSize) * gridSize;
  }

  function initRuler() {
    const ruler = document.getElementById('timeline-ruler');
    if (!ruler) return;

    ruler.addEventListener('mousedown', (e) => {
      const rect = ruler.getBoundingClientRect();
      const scrollArea = document.getElementById('timeline-scroll-area');
      const x = e.clientX - rect.left + (scrollArea ? scrollArea.scrollLeft : 0);
      const time = x / zoom;
      seekToTime(time);

      const onMove = (e2) => {
        const x2 = e2.clientX - rect.left + (scrollArea ? scrollArea.scrollLeft : 0);
        seekToTime(Math.max(0, x2 / zoom));
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  }

  function seekToTime(time) {
    playheadTime = Math.max(0, time);
    updatePlayheadPosition(playheadTime);
    Player.seekTo(playheadTime);
    if (AppState) AppState.currentTime = playheadTime;
  }

  function initPlayheadDrag() {
    const playhead = document.getElementById('timeline-playhead');
    if (!playhead) return;

    let dragging = false;
    playhead.addEventListener('mousedown', (e) => {
      dragging = true;
      e.stopPropagation();
    });
    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const scrollArea = document.getElementById('timeline-scroll-area');
      const rect = scrollArea ? scrollArea.getBoundingClientRect() : null;
      if (!rect) return;
      const x = e.clientX - rect.left + scrollArea.scrollLeft;
      seekToTime(Math.max(0, x / zoom));
    });
    document.addEventListener('mouseup', () => { dragging = false; });
  }

  function initZoom() {
    const slider = document.getElementById('tl-zoom-slider');
    const zoomIn = document.getElementById('btn-tl-zoom-in');
    const zoomOut = document.getElementById('btn-tl-zoom-out');

    if (slider) slider.addEventListener('input', () => {
      zoom = parseInt(slider.value);
      renderTracks();
    });
    if (zoomIn) zoomIn.addEventListener('click', () => {
      zoom = Math.min(200, zoom * 1.5);
      if (slider) slider.value = zoom;
      renderTracks();
    });
    if (zoomOut) zoomOut.addEventListener('click', () => {
      zoom = Math.max(2, zoom / 1.5);
      if (slider) slider.value = zoom;
      renderTracks();
    });

    Keyboard.register('+', () => { zoom = Math.min(200,zoom*1.2); renderTracks(); });
    Keyboard.register('-', () => { zoom = Math.max(2,zoom/1.2); renderTracks(); });
    Keyboard.register('=', () => { zoom = Math.min(200,zoom*1.2); renderTracks(); });
  }

  function updateWidth() {
    const total = totalDuration * zoom;
    document.querySelectorAll('.timeline-track').forEach(el => {
      el.style.minWidth = Math.max(total, 500) + 'px';
    });
  }

  function updateRuler() {
    const ruler = document.getElementById('timeline-ruler');
    if (!ruler) return;
    ruler.innerHTML = '';
    ruler.style.width = Math.max(totalDuration * zoom, 500) + 'px';

    const step = zoom < 10 ? 10 : zoom < 30 ? 5 : zoom < 80 ? 2 : 1;
    const numTicks = Math.ceil(totalDuration / step) + 1;

    for (let i = 0; i < numTicks; i++) {
      const t = i * step;
      const m = Math.floor(t/60), s = Math.floor(t%60);
      const label = document.createElement('div');
      label.style.cssText = `position:absolute;left:${t*zoom}px;display:flex;flex-direction:column;align-items:center;`;
      label.innerHTML = `
        <span style="font-size:9px;color:#555568;font-family:'JetBrains Mono',monospace;white-space:nowrap;">
          ${m>0?String(m).padStart(2,'0')+':':''}${String(s).padStart(2,'0')}
        </span>
        <div style="width:1px;height:6px;background:#333348;"></div>
      `;
      ruler.appendChild(label);
    }
  }

  function updatePlayheadPosition(time) {
    playheadTime = time;
    const playhead = document.getElementById('timeline-playhead');
    if (playhead) {
      playhead.style.left = (time * zoom) + 'px';
    }
  }

  function splitAtPlayhead() {
    if (!selectedClip || !selectedTrack) {
      Toast.show('Select a clip to split', 'warning');
      return;
    }
    const t = playheadTime;
    const clip = selectedClip;
    const track = selectedTrack;
    const inClip = t > clip.startTime && t < clip.startTime + clip.duration;
    if (!inClip) {
      Toast.show('Playhead must be inside a clip to split', 'warning');
      return;
    }

    // Create right half
    const leftDur = t - clip.startTime;
    const rightClip = {
      ...clip,
      id: generateClipId(),
      startTime: t,
      duration: clip.duration - leftDur,
      inPoint: clip.inPoint + leftDur,
      effects: clip.effects.map(e => ({...e, params: {...e.params}}))
    };

    clip.duration = leftDur;
    clip.outPoint = clip.inPoint + leftDur;

    track.clips.push(rightClip);
    track.clips.sort((a,b) => a.startTime - b.startTime);

    renderTrackClips(track);
    AppState.pushUndo('split');
    Toast.show('Clip split', 'success');
  }

  function deleteSelected() {
    if (!selectedClip || !selectedTrack) return;
    const track = selectedTrack;
    track.clips = track.clips.filter(c => c.id !== selectedClip.id);
    selectedClip = null;
    if (AppState) AppState.selectedClip = null;
    renderTrackClips(track);
    updateEffectsPanelEmpty();
    AppState.pushUndo('delete');
    Toast.show('Clip deleted');
  }

  function updateEffectsPanelEmpty() {
    const noClip = document.getElementById('effects-no-clip');
    const stack = document.getElementById('effects-stack');
    if (noClip) noClip.style.display = 'flex';
    if (stack) stack.style.display = 'none';
  }

  function addEffectToSelected(type) {
    if (!selectedClip) {
      Toast.show('Select a clip first', 'warning');
      return;
    }
    const fx = Effects.createEffect(type);
    if (!fx) return;
    selectedClip.effects.push(fx);
    updateEffectsPanel(selectedClip);
    Player.renderFrame();
    Toast.show(`Effect added: ${Effects.getDef(type)?.label || type}`, 'success');
  }

  function initContextMenu() {
    document.getElementById('ctx-split').addEventListener('click', () => {
      splitAtPlayhead();
      hideContextMenu();
    });
    document.getElementById('ctx-delete').addEventListener('click', () => {
      deleteSelected();
      hideContextMenu();
    });
    document.getElementById('ctx-effects').addEventListener('click', () => {
      // Switch to effects tab
      document.querySelector('[data-tab="insp-effects"]').click();
      hideContextMenu();
    });
    document.addEventListener('click', hideContextMenu);
  }

  function showContextMenu(x, y, clip, track) {
    const menu = document.getElementById('context-menu');
    menu.style.display = 'block';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  function hideContextMenu() {
    document.getElementById('context-menu').style.display = 'none';
  }

  function updateAudioMixer() {
    AudioEngine.buildAudioMixerUI(tracks);
  }

  function getClipAtTime(time) {
    for (const track of tracks) {
      for (const clip of track.clips) {
        if (time >= clip.startTime && time < clip.startTime + clip.duration) {
          return { clip, track };
        }
      }
    }
    return null;
  }

  function getAllClips() {
    return tracks.flatMap(t => t.clips.map(c => ({clip:c, track:t})));
  }

  function getState() { return { tracks, totalDuration, zoom }; }

  function loadState(state) {
    if (!state) return;
    tracks = state.tracks || DEFAULT_TRACKS;
    zoom = state.zoom || 20;
    totalDuration = state.totalDuration || 30;
    renderTrackLabels();
    renderTracks();
  }

  return {
    init, getTracks, getSelectedClip, addClipToTrack,
    updatePlayheadPosition, splitAtPlayhead, deleteSelected,
    addEffectToSelected, renderTrackClips, getClipAtTime,
    getAllClips, getState, loadState
  };
})();
