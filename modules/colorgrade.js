/* ====================================
   VDTOR — Color Grading Module
   ==================================== */
'use strict';

const ColorGrade = (() => {

  let curvesCtx, curvesCanvas;
  let scopeCtx, scopeCanvas;
  let activeScope = 'histogram';
  let activeCurve = 'rgb';

  // Color wheel state
  const wheels = {
    lift:  { h: 0, s: 0, l: 0, canvas: null, ctx: null },
    gamma: { h: 0, s: 0, l: 0, canvas: null, ctx: null },
    gain:  { h: 0, s: 0, l: 0, canvas: null, ctx: null }
  };

  // Curve points (normalized 0-1)
  const curves = {
    rgb:  [[0,0],[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]],
    r:    [[0,0],[0.5,0.5],[1,1]],
    g:    [[0,0],[0.5,0.5],[1,1]],
    b:    [[0,0],[0.5,0.5],[1,1]],
    luma: [[0,0],[0.5,0.5],[1,1]]
  };

  const adjustments = {
    temp: 0, tint: 0, shadows: 0, highlights: 0, vibrance: 0
  };

  const activeLUT = null;

  function init() {
    curvesCanvas = document.getElementById('curves-canvas');
    curvesCtx = curvesCanvas ? curvesCanvas.getContext('2d') : null;
    scopeCanvas = document.getElementById('scope-canvas');
    scopeCtx = scopeCanvas ? scopeCanvas.getContext('2d') : null;

    // Draw color wheels
    ['lift','gamma','gain'].forEach(name => {
      const canvas = document.getElementById(`cw-${name}`);
      if (!canvas) return;
      wheels[name].canvas = canvas;
      wheels[name].ctx = canvas.getContext('2d');
      drawColorWheel(wheels[name].ctx, canvas.width/2, canvas.height/2, canvas.width/2 - 4);
      addWheelInteraction(canvas, name);
    });

    // Draw curves
    drawCurves();

    // Curve tabs
    document.querySelectorAll('.curve-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.curve-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeCurve = btn.dataset.curve;
        drawCurves();
      });
    });

    // Scope tabs
    document.querySelectorAll('.scope-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.scope-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeScope = btn.dataset.scope;
        drawScope();
      });
    });

    // Adjustment sliders
    ['temp','tint','shadows','highlights','vibrance'].forEach(id => {
      const slider = document.getElementById(`adj-${id}`);
      const val = document.getElementById(`adj-${id}-val`);
      if (!slider) return;
      slider.addEventListener('input', () => {
        adjustments[id] = parseInt(slider.value);
        if (val) val.textContent = slider.value;
      });
    });

    // LUT
    const lutSel = document.getElementById('lut-select');
    if (lutSel) {
      lutSel.addEventListener('change', () => {
        Toast.show(`LUT: ${lutSel.options[lutSel.selectedIndex].text}`, 'success');
      });
    }

    // Curves canvas interaction
    if (curvesCanvas) {
      let draggingPoint = -1;
      curvesCanvas.addEventListener('mousedown', (e) => {
        const rect = curvesCanvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) / curvesCanvas.width;
        const my = 1 - (e.clientY - rect.top) / curvesCanvas.height;
        const pts = curves[activeCurve];
        let closest = -1, minD = 0.05;
        pts.forEach((pt, i) => {
          const d = Math.hypot(pt[0]-mx, pt[1]-my);
          if (d < minD) { minD = d; closest = i; }
        });
        if (closest >= 0) {
          draggingPoint = closest;
        } else {
          // Add new point
          pts.push([mx, Math.max(0,Math.min(1,my))]);
          pts.sort((a,b) => a[0]-b[0]);
          drawCurves();
        }
      });
      curvesCanvas.addEventListener('mousemove', (e) => {
        if (draggingPoint < 0) return;
        const rect = curvesCanvas.getBoundingClientRect();
        const mx = Math.max(0,Math.min(1, (e.clientX - rect.left) / curvesCanvas.width));
        const my = Math.max(0,Math.min(1, 1 - (e.clientY - rect.top) / curvesCanvas.height));
        curves[activeCurve][draggingPoint] = [mx, my];
        curves[activeCurve].sort((a,b) => a[0]-b[0]);
        drawCurves();
      });
      curvesCanvas.addEventListener('mouseup', () => { draggingPoint = -1; });
      curvesCanvas.addEventListener('mouseleave', () => { draggingPoint = -1; });
    }

    drawScope();
    setInterval(drawScope, 2000); // Update scope periodically
  }

  function drawColorWheel(ctx, cx, cy, r) {
    // Hue ring
    for (let a = 0; a < 360; a++) {
      const startAngle = (a-1) * Math.PI/180;
      const endAngle = (a+1) * Math.PI/180;
      const grad = ctx.createRadialGradient(cx, cy, r*0.3, cx, cy, r);
      grad.addColorStop(0, 'white');
      grad.addColorStop(1, `hsl(${a},100%,50%)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, startAngle, endAngle);
      ctx.closePath();
      ctx.fill();
    }
    // Dark center dot
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI*2);
    ctx.fill();
  }

  function addWheelInteraction(canvas, name) {
    let dragging = false;
    const draw = (e) => {
      if (!dragging) return;
      const rect = canvas.getBoundingClientRect();
      const cx = canvas.width/2, cy = canvas.height/2;
      const x = (e.clientX - rect.left) - cx;
      const y = (e.clientY - rect.top) - cy;
      const r = canvas.width/2 - 4;
      const dist = Math.min(Math.hypot(x,y), r);
      wheels[name].h = (Math.atan2(y,x) * 180/Math.PI + 360) % 360;
      wheels[name].s = dist / r;
      // Redraw wheel with indicator
      const ctx = wheels[name].ctx;
      ctx.clearRect(0,0,canvas.width,canvas.height);
      drawColorWheel(ctx, cx, cy, r);
      // Indicator dot
      const ix = cx + x, iy = cy + y;
      ctx.beginPath();
      ctx.arc(ix, iy, 5, 0, Math.PI*2);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
    };
    canvas.addEventListener('mousedown', (e) => { dragging = true; draw(e); });
    canvas.addEventListener('mousemove', draw);
    canvas.addEventListener('mouseup', () => { dragging = false; });
    canvas.addEventListener('mouseleave', () => { dragging = false; });
  }

  function drawCurves() {
    if (!curvesCtx || !curvesCanvas) return;
    const ctx = curvesCtx;
    const w = curvesCanvas.width, h = curvesCanvas.height;
    const pts = curves[activeCurve];

    ctx.clearRect(0,0,w,h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      ctx.beginPath(); ctx.moveTo(w*i/4, 0); ctx.lineTo(w*i/4, h); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, h*i/4); ctx.lineTo(w, h*i/4); ctx.stroke();
    }

    // Diagonal reference
    ctx.setLineDash([3,3]);
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(0,h); ctx.lineTo(w,0); ctx.stroke();
    ctx.setLineDash([]);

    // Curve line
    const colors = { rgb:'rgba(255,255,255,0.8)', r:'rgba(255,100,100,0.9)',
                     g:'rgba(100,220,100,0.9)', b:'rgba(100,150,255,0.9)', luma:'rgba(200,200,255,0.8)' };
    ctx.strokeStyle = colors[activeCurve] || 'white';
    ctx.lineWidth = 2;
    ctx.beginPath();
    pts.forEach((pt, i) => {
      const px = pt[0]*w, py = (1-pt[1])*h;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();

    // Control points
    pts.forEach(pt => {
      const px = pt[0]*w, py = (1-pt[1])*h;
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI*2);
      ctx.fillStyle = 'white';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
    });
  }

  function drawScope(imageData) {
    if (!scopeCtx || !scopeCanvas) return;
    const ctx = scopeCtx;
    const w = scopeCanvas.width, h = scopeCanvas.height;
    ctx.clearRect(0,0,w,h);

    if (activeScope === 'histogram') {
      drawHistogram(ctx, w, h, imageData);
    } else {
      drawWaveform(ctx, w, h, imageData);
    }
  }

  function drawHistogram(ctx, w, h, imageData) {
    // Draw a decorative/mock histogram if no image data
    const bins = 64;
    const binW = w / bins;

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,w,h);

    if (!imageData) {
      // Draw decorative histogram
      for (let i = 0; i < bins; i++) {
        const t = i/bins;
        const barH = Math.sin(t * Math.PI) * 0.7 * h + Math.random() * 0.1 * h;
        const hue = t * 240;
        ctx.fillStyle = `hsla(${hue},70%,60%,0.6)`;
        ctx.fillRect(i*binW, h-barH, binW-1, barH);
      }
      return;
    }

    // Real histogram from image data
    const rBins = new Array(256).fill(0);
    const gBins = new Array(256).fill(0);
    const bBins = new Array(256).fill(0);

    for (let i = 0; i < imageData.data.length; i+=4) {
      rBins[imageData.data[i]]++;
      gBins[imageData.data[i+1]]++;
      bBins[imageData.data[i+2]]++;
    }

    const maxVal = Math.max(...rBins, ...gBins, ...bBins);
    const scale = h / maxVal;

    ['r','g','b'].forEach((ch, ci) => {
      const bins = [rBins, gBins, bBins][ci];
      const colors = ['rgba(255,80,80,0.5)','rgba(80,220,80,0.5)','rgba(80,120,255,0.5)'];
      ctx.fillStyle = colors[ci];
      bins.forEach((v,i) => {
        const x = (i/255)*w, barH = v*scale;
        ctx.fillRect(x, h-barH, w/255, barH);
      });
    });
  }

  function drawWaveform(ctx, w, h) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0,0,w,h);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      ctx.beginPath(); ctx.moveTo(0, h*i/4); ctx.lineTo(w, h*i/4); ctx.stroke();
    }

    // Mock waveform
    ctx.strokeStyle = 'rgba(100,220,100,0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h/2 + Math.sin(x/w*10) * h*0.3 + Math.random()*5;
      x===0 ? ctx.moveTo(x,y) : ctx.lineTo(x,y);
    }
    ctx.stroke();
  }

  function updateScope(imageData) {
    drawScope(imageData);
  }

  // Apply color grade to canvas context
  function applyToCtx(ctx, w, h) {
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    for (let i = 0; i < data.length; i+=4) {
      let r = data[i]/255, g = data[i+1]/255, b = data[i+2]/255;

      // Temperature
      if (adjustments.temp !== 0) {
        const t = adjustments.temp / 100;
        r += t * 0.1; b -= t * 0.1;
      }

      // Tint
      if (adjustments.tint !== 0) {
        const t = adjustments.tint / 100;
        g += t * 0.05;
      }

      // Shadows / Highlights (simple lift/roll-off)
      const lum = r*0.299 + g*0.587 + b*0.114;
      if (adjustments.shadows !== 0) {
        const shadow = Math.max(0, 1 - lum*3) * (adjustments.shadows/100) * 0.3;
        r += shadow; g += shadow; b += shadow;
      }
      if (adjustments.highlights !== 0) {
        const hi = Math.max(0, lum*2-1) * (adjustments.highlights/100) * 0.3;
        r += hi; g += hi; b += hi;
      }

      data[i]   = Math.max(0, Math.min(255, r*255));
      data[i+1] = Math.max(0, Math.min(255, g*255));
      data[i+2] = Math.max(0, Math.min(255, b*255));
    }

    ctx.putImageData(imgData, 0, 0);
  }

  return { init, drawCurves, updateScope, applyToCtx };
})();
