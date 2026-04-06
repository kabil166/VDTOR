/* ====================================
   VDTOR — Audio Module
   Web Audio API — Mixer, Waveform, FX
   ==================================== */
'use strict';

const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let analyserL = null, analyserR = null;
  let meterTimer = null;
  const trackNodes = {};

  function ensureContext() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = 1;

      analyserL = ctx.createAnalyser();
      analyserL.fftSize = 256;
      analyserR = ctx.createAnalyser();
      analyserR.fftSize = 256;

      masterGain.connect(analyserL);
      masterGain.connect(ctx.destination);

      startMeterAnimation();
    }
    return ctx;
  }

  function createTrackChain(trackId) {
    if (trackNodes[trackId]) return trackNodes[trackId];
    ensureContext();

    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    gain.connect(analyser);
    if (panner) {
      analyser.connect(panner);
      panner.connect(masterGain);
    } else {
      analyser.connect(masterGain);
    }

    trackNodes[trackId] = { gain, panner, analyser };
    return trackNodes[trackId];
  }

  function setTrackVolume(trackId, vol) {
    ensureContext();
    const chain = createTrackChain(trackId);
    chain.gain.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
  }

  function setTrackPan(trackId, pan) {
    ensureContext();
    const chain = createTrackChain(trackId);
    if (chain.panner) chain.panner.pan.value = pan;
  }

  function setMasterVolume(vol) {
    if (!masterGain) ensureContext();
    masterGain.gain.setTargetAtTime(vol, ctx.currentTime, 0.05);
  }

  function connectVideoElement(videoEl, trackId) {
    ensureContext();
    if (ctx.state === 'suspended') ctx.resume();
    const chain = createTrackChain(trackId);
    const source = ctx.createMediaElementSource(videoEl);
    source.connect(chain.gain);
    return source;
  }

  function startMeterAnimation() {
    const meterL = document.getElementById('master-meter-l');
    const meterR = document.getElementById('master-meter-r');

    function tick() {
      if (analyserL && meterL) {
        const data = new Uint8Array(analyserL.frequencyBinCount);
        analyserL.getByteFrequencyData(data);
        const rms = data.reduce((a,v) => a+v*v, 0) / data.length;
        const pct = Math.min(100, Math.sqrt(rms) * 3);
        let fill = meterL.querySelector('.audio-meter-fill');
        if (!fill) {
          fill = document.createElement('div');
          fill.className = 'audio-meter-fill';
          meterL.appendChild(fill);
        }
        fill.style.height = pct + '%';
        if (meterR) {
          let fillR = meterR.querySelector('.audio-meter-fill');
          if (!fillR) {
            fillR = document.createElement('div');
            fillR.className = 'audio-meter-fill';
            meterR.appendChild(fillR);
          }
          fillR.style.height = (pct * (0.85 + Math.random() * 0.3)) + '%';
        }
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  function drawWaveform(canvas, audioBuffer) {
    if (!canvas || !audioBuffer) return;
    const ctx2d = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const data = audioBuffer.getChannelData(0);
    const step = Math.ceil(data.length / w);

    ctx2d.clearRect(0,0,w,h);
    ctx2d.strokeStyle = 'rgba(6,182,212,0.8)';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();

    for (let i = 0; i < w; i++) {
      let min = 1, max = -1;
      for (let j = 0; j < step; j++) {
        const d = data[i*step+j] || 0;
        if (d < min) min = d;
        if (d > max) max = d;
      }
      const y1 = (1 + min) / 2 * h;
      const y2 = (1 + max) / 2 * h;
      ctx2d.moveTo(i, y1);
      ctx2d.lineTo(i, y2);
    }
    ctx2d.stroke();
  }

  function renderClipWaveform(clipEl, audioUrl) {
    const canvas = clipEl.querySelector('.clip-waveform');
    if (!canvas) return;

    ensureContext();
    fetch(audioUrl)
      .then(r => r.arrayBuffer())
      .then(buf => ctx.decodeAudioData(buf))
      .then(audioBuf => drawWaveform(canvas, audioBuf))
      .catch(() => {
        // Draw placeholder waveform
        drawPlaceholderWaveform(canvas);
      });
  }

  function drawPlaceholderWaveform(canvas) {
    const ctx2d = canvas.getContext('2d');
    const w = canvas.width || 200, h = canvas.height || 36;
    ctx2d.strokeStyle = 'rgba(6,182,212,0.5)';
    ctx2d.lineWidth = 1;
    ctx2d.beginPath();
    for (let x = 0; x < w; x++) {
      const amp = Math.sin(x * 0.3) * Math.sin(x * 0.07) * h * 0.4;
      ctx2d.moveTo(x, h/2 + amp);
      ctx2d.lineTo(x, h/2 - amp);
    }
    ctx2d.stroke();
  }

  function buildAudioMixerUI(tracks) {
    const container = document.getElementById('audio-track-mixers');
    if (!container) return;
    container.innerHTML = '';

    tracks.forEach((track, i) => {
      if (track.type !== 'audio' && track.type !== 'video') return;
      const div = document.createElement('div');
      div.className = 'audio-track-mixer';
      div.innerHTML = `
        <div class="audio-track-name">${track.name}</div>
        <div class="audio-track-controls">
          <button class="audio-track-btn ${track.muted?'':'active-mute'}" title="Mute" data-idx="${i}">M</button>
          <input type="range" min="0" max="100" value="${Math.round(track.volume*100)}" 
                 style="flex:1" title="Volume" data-trackid="${track.id}"/>
          <span style="font-size:10px;color:var(--text-3);min-width:28px;text-align:right;">${Math.round(track.volume*100)}%</span>
        </div>
        <div class="audio-track-controls" style="margin-top:2px">
          <span style="font-size:10px;color:var(--text-3)">Pan</span>
          <input type="range" min="-100" max="100" value="0" style="flex:1" title="Pan" data-pan="${track.id}"/>
        </div>
      `;
      const vol = div.querySelector('input[type="range"][title="Volume"]');
      if (vol) {
        vol.addEventListener('input', () => {
          const v = parseInt(vol.value)/100;
          setTrackVolume(track.id, v);
          vol.nextElementSibling.textContent = Math.round(v*100)+'%';
        });
      }
      container.appendChild(div);
    });
  }

  function resume() {
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  return {
    ensureContext, connectVideoElement, setTrackVolume, setTrackPan,
    setMasterVolume, renderClipWaveform, drawPlaceholderWaveform,
    buildAudioMixerUI, resume
  };
})();
