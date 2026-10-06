/* tandai-ss — renderer */
(function (g) {
  'use strict';
  const TS = g.TS;
  const tmp = document.createElement('canvas');

  const contrast = hex => {
    const n = parseInt(hex.slice(1), 16);
    const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
    return l > 150 ? '#111827' : '#ffffff';
  };

  /* Region of a censor object clamped to the canvas, or null if empty. */
  function censorRegion(c, o) {
    const W = c.canvas.width, H = c.canvas.height, b = TS.box(o);
    const x = TS.clamp(b.x, 0, W), y = TS.clamp(b.y, 0, H);
    const w = TS.clamp(b.x + b.w, 0, W) - x, h = TS.clamp(b.y + b.h, 0, H) - y;
    return w < 1 || h < 1 ? null : { x, y, w, h };
  }

  function pixelRegion(c, r, o) {
    const bs = Math.max(6, o.size * 3);
    const tw = Math.max(1, Math.ceil(r.w / bs)), th = Math.max(1, Math.ceil(r.h / bs));
    tmp.width = tw; tmp.height = th;
    const t = tmp.getContext('2d');
    t.imageSmoothingEnabled = true;
    t.drawImage(c.canvas, r.x, r.y, r.w, r.h, 0, 0, tw, th);
    c.save();
    c.imageSmoothingEnabled = false;
    c.drawImage(tmp, 0, 0, tw, th, r.x, r.y, r.w, r.h);
    c.restore();
  }

  function blurRegion(c, r, o) {
    const W = c.canvas.width, H = c.canvas.height;
    tmp.width = W; tmp.height = H;
    tmp.getContext('2d').drawImage(c.canvas, 0, 0); // snapshot of current pixels
    c.save();
    c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip();
    c.clearRect(r.x, r.y, r.w, r.h);                // nothing sharp can remain underneath
    c.filter = `blur(${Math.max(8, o.size * 3)}px)`;
    c.drawImage(tmp, 0, 0);
    c.filter = 'none';
    c.globalCompositeOperation = 'destination-over'; // fill any semi-transparent edge pixels
    c.fillStyle = '#8a8f98';
    c.fillRect(r.x, r.y, r.w, r.h);
    c.restore();
  }

  function drawPixelate(c, o) {
    const r = censorRegion(c, o);
    if (!r) return;
    const mode = o.mode || 'pixel';
    if (mode === 'black') { c.save(); c.fillStyle = '#000'; c.fillRect(r.x, r.y, r.w, r.h); c.restore(); }
    else if (mode === 'blur' && typeof c.filter === 'string') blurRegion(c, r, o);
    else pixelRegion(c, r, o);
  }

  function drawObject(c, o) {
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = o.color; c.fillStyle = o.color; c.lineWidth = o.size;

    switch (o.type) {
      case 'rect': {
        const b = TS.box(o);
        if (o.fill !== 'none') {
          c.globalAlpha = o.fill === 'soft' ? 0.25 : 1;
          c.fillRect(b.x, b.y, b.w, b.h);
          c.globalAlpha = 1;
        }
        c.strokeRect(b.x, b.y, b.w, b.h);
        break;
      }
      case 'ellipse': {
        const b = TS.box(o);
        c.beginPath();
        c.ellipse(b.x + b.w / 2, b.y + b.h / 2, Math.max(b.w / 2, .5), Math.max(b.h / 2, .5), 0, 0, Math.PI * 2);
        if (o.fill !== 'none') {
          c.globalAlpha = o.fill === 'soft' ? 0.25 : 1;
          c.fill(); c.globalAlpha = 1;
        }
        c.stroke();
        break;
      }
      case 'highlight': {
        const b = TS.box(o);
        c.globalCompositeOperation = 'multiply';
        c.globalAlpha = 0.85;
        c.fillRect(b.x, b.y, b.w, b.h);
        break;
      }
      case 'arrow': {
        const ang = Math.atan2(o.y2 - o.y1, o.x2 - o.x1);
        const hl = Math.max(14, o.size * 3.6);
        const bx = o.x2 - Math.cos(ang) * hl * 0.8, by = o.y2 - Math.sin(ang) * hl * 0.8;
        c.beginPath(); c.moveTo(o.x1, o.y1); c.lineTo(bx, by); c.stroke();
        c.beginPath();
        c.moveTo(o.x2, o.y2);
        c.lineTo(o.x2 - hl * Math.cos(ang - 0.42), o.y2 - hl * Math.sin(ang - 0.42));
        c.lineTo(o.x2 - hl * Math.cos(ang + 0.42), o.y2 - hl * Math.sin(ang + 0.42));
        c.closePath(); c.fill();
        break;
      }
      case 'step': {
        const r = TS.stepRadius(o);
        c.beginPath(); c.arc(o.x1, o.y1, r, 0, Math.PI * 2); c.fill();
        c.lineWidth = Math.max(2, r * 0.12); c.strokeStyle = '#fff'; c.stroke();
        c.fillStyle = contrast(o.color);
        c.font = `700 ${r * 1.15}px "Segoe UI",system-ui,sans-serif`;
        c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillText(String(o.text), o.x1, o.y1 + r * 0.06);
        break;
      }
      case 'text': {
        const b = TS.textBox(o), pad = TS.textPad(o), fs = TS.fontPx(o);
        if (o.fill !== 'none') {
          c.globalAlpha = o.fill === 'soft' ? 0.88 : 1;
          const rad = fs * 0.25;
          c.beginPath(); c.roundRect(b.x, b.y, b.w, b.h, rad); c.fill();
          c.globalAlpha = 1;
          c.fillStyle = contrast(o.color);
        }
        c.font = TS.fontCss(o); c.textBaseline = 'top';
        o.text.split('\n').forEach((l, i) => c.fillText(l, o.x1 + pad, o.y1 + pad + i * fs * 1.25));
        break;
      }
    }
    c.restore();
  }

  function drawStamp(c, s) {
    if (!s || !s.text) return;
    const W = c.canvas.width, H = c.canvas.height;
    let fs = Math.max(12, Math.round(W / 85));
    c.save();
    const font = f => `600 ${f}px "Segoe UI",system-ui,sans-serif`;
    c.font = font(fs);
    const maxW = W * 0.96;
    let tw = c.measureText(s.text).width, pad = fs * 0.55;
    if (tw + pad * 2 > maxW) { fs = Math.max(8, fs * (maxW - pad * 2) / tw); c.font = font(fs); tw = c.measureText(s.text).width; pad = fs * 0.55; }
    const bw = tw + pad * 2, bh = fs + pad * 1.4, m = fs * 0.6;
    const x = s.pos.includes('r') ? W - bw - m : m;
    const y = s.pos.includes('b') ? H - bh - m : m;
    c.fillStyle = 'rgba(15,23,32,.78)';
    c.beginPath(); c.roundRect(x, y, bw, bh, fs * 0.3); c.fill();
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.textAlign = 'left';
    c.fillText(s.text, x + pad, y + bh / 2 + fs * 0.04);
    c.restore();
  }

  /* Draw base image + all objects at image resolution. */
  TS.render = (c, doc, opts = {}) => {
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, c.canvas.width, c.canvas.height);
    c.drawImage(doc.base, 0, 0);
    for (const o of doc.objects) {
      if (o.id === opts.hideId) continue;
      o.type === 'pixelate' ? drawPixelate(c, o) : drawObject(c, o);
    }
    if (opts.draft) opts.draft.type === 'pixelate' ? drawPixelate(c, opts.draft) : drawObject(c, opts.draft);
    drawStamp(c, opts.stamp);
  };

  /* Display-only overlay: selection frame, handles, crop mask. */
  TS.overlay = (c, doc, o) => {
    const k = o.k; // image px per screen px
    c.save();
    if (o.crop) {
      const r = TS.box(o.crop), W = c.canvas.width, H = c.canvas.height;
      c.fillStyle = 'rgba(10,20,30,.55)';
      c.beginPath(); c.rect(0, 0, W, H); c.rect(r.x, r.y, r.w, r.h); c.fill('evenodd');
      c.strokeStyle = '#fff'; c.lineWidth = 1.5 * k; c.setLineDash([6 * k, 4 * k]);
      c.strokeRect(r.x, r.y, r.w, r.h);
    }
    const target = o.draft || (!o.hideSel && o.sel);
    if (target) {
      const b = TS.bounds(target), p = 4 * k;
      c.strokeStyle = '#0d9488'; c.lineWidth = 1.4 * k; c.setLineDash([5 * k, 4 * k]);
      if (target.type !== 'arrow') c.strokeRect(b.x - p, b.y - p, b.w + p * 2, b.h + p * 2);
      if (!o.draft) {
        c.setLineDash([]); c.fillStyle = '#fff';
        const hs = 9 * k;
        for (const h of TS.handles(target)) {
          c.beginPath(); c.rect(h.x - hs / 2, h.y - hs / 2, hs, hs); c.fill(); c.stroke();
        }
      }
    }
    c.restore();
  };
})(window);
