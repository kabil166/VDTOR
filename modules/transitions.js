/* ====================================
   VDTOR — Transitions Module
   ==================================== */
'use strict';

const Transitions = (() => {

  const TRANSITION_DEFS = {
    cut:          { label: 'Cut',           emoji: '✂️',  duration: 0 },
    dissolve:     { label: 'Dissolve',      emoji: '🌫️', duration: 0.5 },
    fade:         { label: 'Fade to Black', emoji: '⬛',  duration: 0.5 },
    fadewhite:    { label: 'Fade to White', emoji: '⬜',  duration: 0.5 },
    wipeleft:     { label: 'Wipe Left',     emoji: '◀️', duration: 0.4 },
    wiperight:    { label: 'Wipe Right',    emoji: '▶️', duration: 0.4 },
    wipeup:       { label: 'Wipe Up',       emoji: '🔼',  duration: 0.4 },
    wipedown:     { label: 'Wipe Down',     emoji: '🔽',  duration: 0.4 },
    zoomin:       { label: 'Zoom In',       emoji: '🔍',  duration: 0.4 },
    zoomout:      { label: 'Zoom Out',      emoji: '🔎',  duration: 0.4 },
    spin:         { label: 'Spin',          emoji: '🌀',  duration: 0.4 },
    whippan:      { label: 'Whip Pan',      emoji: '💨',  duration: 0.25 },
    glitch:       { label: 'Glitch',        emoji: '⚡',  duration: 0.35 },
    filmburn:     { label: 'Film Burn',     emoji: '🔥',  duration: 0.5 },
    lightleak:    { label: 'Light Leak',    emoji: '💛',  duration: 0.5 },
    pixeldissolve:{ label: 'Pixel Dissolve',emoji: '🔲', duration: 0.5 }
  };

  function getDef(type) { return TRANSITION_DEFS[type] || null; }
  function getAllDefs() { return TRANSITION_DEFS; }

  // Render a transition frame into ctx
  // fromCanvas = previous clip frame; toCanvas = next clip frame
  // progress = 0..1 (0=fully from, 1=fully to)
  function render(ctx, fromCanvas, toCanvas, type, progress, w, h) {
    const ease = easeInOut(progress);

    ctx.clearRect(0, 0, w, h);

    switch(type) {
      case 'cut':
        ctx.drawImage(progress < 0.5 ? fromCanvas : toCanvas, 0, 0, w, h);
        break;

      case 'dissolve':
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.globalAlpha = ease;
        ctx.drawImage(toCanvas, 0, 0, w, h);
        ctx.globalAlpha = 1;
        break;

      case 'fade':
        ctx.drawImage(progress < 0.5 ? fromCanvas : toCanvas, 0, 0, w, h);
        ctx.fillStyle = 'black';
        ctx.globalAlpha = progress < 0.5 ? easeInOut(progress*2) : easeInOut(2-progress*2);
        ctx.fillRect(0,0,w,h);
        ctx.globalAlpha = 1;
        break;

      case 'fadewhite':
        ctx.drawImage(progress < 0.5 ? fromCanvas : toCanvas, 0, 0, w, h);
        ctx.fillStyle = 'white';
        ctx.globalAlpha = progress < 0.5 ? easeInOut(progress*2) : easeInOut(2-progress*2);
        ctx.fillRect(0,0,w,h);
        ctx.globalAlpha = 1;
        break;

      case 'wipeleft':
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.drawImage(toCanvas, 0, 0, w * ease, h, 0, 0, w * ease, h);
        break;

      case 'wiperight':
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        const startX = w * (1 - ease);
        ctx.drawImage(toCanvas, startX, 0, w - startX, h, startX, 0, w - startX, h);
        break;

      case 'wipeup':
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.drawImage(toCanvas, 0, 0, w, h * ease, 0, 0, w, h * ease);
        break;

      case 'wipedown':
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        const startY = h * (1 - ease);
        ctx.drawImage(toCanvas, 0, startY, w, h - startY, 0, startY, w, h - startY);
        break;

      case 'zoomin':
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.globalAlpha = ease;
        const scale = 0.5 + ease * 0.5;
        ctx.save();
        ctx.translate(w/2, h/2);
        ctx.scale(scale, scale);
        ctx.drawImage(toCanvas, -w/2, -h/2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'zoomout':
        ctx.drawImage(toCanvas, 0, 0, w, h);
        ctx.globalAlpha = 1 - ease;
        const scaleOut = 1 + ease;
        ctx.save();
        ctx.translate(w/2, h/2);
        ctx.scale(scaleOut, scaleOut);
        ctx.drawImage(fromCanvas, -w/2, -h/2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'spin':
        ctx.save();
        ctx.translate(w/2, h/2);
        ctx.rotate(ease * Math.PI * 2);
        ctx.globalAlpha = 1-ease;
        ctx.drawImage(fromCanvas, -w/2, -h/2, w, h);
        ctx.restore();
        ctx.save();
        ctx.translate(w/2, h/2);
        ctx.rotate((ease-1) * Math.PI * 2);
        ctx.globalAlpha = ease;
        ctx.drawImage(toCanvas, -w/2, -h/2, w, h);
        ctx.restore();
        ctx.globalAlpha = 1;
        break;

      case 'whippan':
        ctx.save();
        ctx.translate(-w * ease * 3, 0);
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.restore();
        ctx.save();
        ctx.translate(w - w * ease * 3, 0);
        ctx.drawImage(toCanvas, 0, 0, w, h);
        ctx.restore();
        break;

      case 'glitch':
        // Random slice glitch
        const slices = 12;
        const sliceH = h / slices;
        for (let i = 0; i < slices; i++) {
          const t = Math.random() > ease ? 0 : 1;
          const src = t === 0 ? fromCanvas : toCanvas;
          const offsetX = (Math.random() - 0.5) * 30 * ease;
          ctx.drawImage(src, 0, i*sliceH, w, sliceH, offsetX, i*sliceH, w, sliceH);
        }
        // Color glitch overlay
        if (ease > 0.2 && ease < 0.8) {
          ctx.globalAlpha = (1 - Math.abs(ease-0.5)*4) * 0.5;
          ctx.fillStyle = `hsl(${Math.random()*360},100%,50%)`;
          ctx.globalCompositeOperation = 'screen';
          ctx.fillRect(0, Math.random()*h, w, Math.random()*10+2);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
        break;

      case 'filmburn':
        ctx.drawImage(progress < 0.5 ? fromCanvas : toCanvas, 0, 0, w, h);
        // Orange burn overlay
        const burnAlpha = Math.sin(progress * Math.PI) * 0.8;
        const burnGrad = ctx.createRadialGradient(w*0.4+Math.random()*w*0.2, h/2, 0, w/2, h/2, w*0.6);
        burnGrad.addColorStop(0, `rgba(255,220,50,${burnAlpha})`);
        burnGrad.addColorStop(0.3, `rgba(255,100,0,${burnAlpha*0.7})`);
        burnGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = burnGrad;
        ctx.globalCompositeOperation = 'screen';
        ctx.fillRect(0,0,w,h);
        ctx.globalCompositeOperation = 'source-over';
        break;

      case 'lightleak':
        ctx.drawImage(progress < 0.5 ? fromCanvas : toCanvas, 0, 0, w, h);
        const leakAlpha = Math.sin(progress * Math.PI);
        const leakGrad = ctx.createLinearGradient(0, 0, w, h);
        leakGrad.addColorStop(0, `rgba(255,200,100,${leakAlpha * 0.5})`);
        leakGrad.addColorStop(0.5, `rgba(255,255,150,${leakAlpha * 0.3})`);
        leakGrad.addColorStop(1, `rgba(200,100,255,${leakAlpha * 0.3})`);
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = leakGrad;
        ctx.fillRect(0,0,w,h);
        ctx.globalCompositeOperation = 'source-over';
        break;

      case 'pixeldissolve':
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.globalAlpha = ease;
        // Checkerboard grow
        const pxSize = Math.max(2, Math.floor((1-ease)*16));
        for (let py = 0; py < h; py += pxSize) {
          for (let px = 0; px < w; px += pxSize) {
            if (Math.random() < ease) {
              ctx.drawImage(toCanvas, px, py, pxSize, pxSize, px, py, pxSize, pxSize);
            }
          }
        }
        ctx.globalAlpha = 1;
        break;

      default:
        // fallback: dissolve
        ctx.drawImage(fromCanvas, 0, 0, w, h);
        ctx.globalAlpha = ease;
        ctx.drawImage(toCanvas, 0, 0, w, h);
        ctx.globalAlpha = 1;
        break;
    }
  }

  function easeInOut(t) {
    return t < 0.5 ? 2*t*t : -1+(4-2*t)*t;
  }

  return { render, getDef, getAllDefs, TRANSITION_DEFS };
})();
