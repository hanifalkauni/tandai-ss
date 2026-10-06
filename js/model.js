/* tandai-ss — model: object geometry, hit-testing, history */
(function (g) {
  'use strict';
  const TS = g.TS = g.TS || {};

  TS.clone = v => JSON.parse(JSON.stringify(v));
  TS.clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* Objects that are defined by a dragged rectangle */
  TS.BOX_TYPES = new Set(['rect', 'ellipse', 'highlight', 'pixelate']);

  /* ---------- Text measurement ---------- */
  const mctx = document.createElement('canvas').getContext('2d');
  TS.fontPx = o => 12 + o.size * 3;
  TS.fontCss = (o, k = 1) => `600 ${TS.fontPx(o) * k}px "Segoe UI",system-ui,sans-serif`;
  TS.textPad = o => (o.fill !== 'none' ? TS.fontPx(o) * 0.3 : 0);
  TS.stepRadius = o => 10 + o.size * 2;

  TS.textBox = o => {
    mctx.font = TS.fontCss(o);
    const lines = (o.text || ' ').split('\n');
    const pad = TS.textPad(o);
    const w = Math.max(...lines.map(l => mctx.measureText(l).width), 4);
    return { x: o.x1, y: o.y1, w: w + pad * 2, h: lines.length * TS.fontPx(o) * 1.25 + pad * 2 };
  };

  /* ---------- Geometry ---------- */
  TS.box = o => ({
    x: Math.min(o.x1, o.x2), y: Math.min(o.y1, o.y2),
    w: Math.abs(o.x2 - o.x1), h: Math.abs(o.y2 - o.y1)
  });

  TS.bounds = o => {
    if (TS.BOX_TYPES.has(o.type)) return TS.box(o);
    if (o.type === 'text') return TS.textBox(o);
    if (o.type === 'step') { const r = TS.stepRadius(o); return { x: o.x1 - r, y: o.y1 - r, w: r * 2, h: r * 2 }; }
    return TS.box(o); // arrow
  };

  TS.handles = o => {
    if (o.type === 'arrow') return [{ id: 'a', x: o.x1, y: o.y1 }, { id: 'b', x: o.x2, y: o.y2 }];
    if (!TS.BOX_TYPES.has(o.type)) return [];
    const b = TS.box(o);
    return [
      { id: 'nw', x: b.x, y: b.y }, { id: 'ne', x: b.x + b.w, y: b.y },
      { id: 'sw', x: b.x, y: b.y + b.h }, { id: 'se', x: b.x + b.w, y: b.y + b.h }
    ];
  };

  /* Apply a handle drag to a copy of the original object. */
  TS.resize = (o, orig, handle, p) => {
    if (orig.type === 'arrow') {
      if (handle === 'a') { o.x1 = p.x; o.y1 = p.y; } else { o.x2 = p.x; o.y2 = p.y; }
      return;
    }
    const b = TS.box(orig);
    const fx = handle.includes('w') ? b.x + b.w : b.x;
    const fy = handle.includes('n') ? b.y + b.h : b.y;
    o.x1 = fx; o.y1 = fy; o.x2 = p.x; o.y2 = p.y;
  };

  TS.translate = (o, orig, dx, dy) => {
    o.x1 = orig.x1 + dx; o.y1 = orig.y1 + dy;
    o.x2 = orig.x2 + dx; o.y2 = orig.y2 + dy;
  };

  const segDist = (px, py, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    const t = l2 ? TS.clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  };

  TS.hit = (o, x, y, tol) => {
    switch (o.type) {
      case 'arrow':
        return segDist(x, y, o.x1, o.y1, o.x2, o.y2) <= tol + o.size / 2;
      case 'text': {
        const b = TS.textBox(o);
        return x >= b.x - tol && x <= b.x + b.w + tol && y >= b.y - tol && y <= b.y + b.h + tol;
      }
      case 'step':
        return Math.hypot(x - o.x1, y - o.y1) <= TS.stepRadius(o) + tol;
      case 'ellipse': {
        const b = TS.box(o), a = Math.max(b.w / 2, 1), c = Math.max(b.h / 2, 1);
        const d = Math.hypot((x - (b.x + a)) / a, (y - (b.y + c)) / c);
        if (o.fill !== 'none') return d <= 1 + tol / Math.min(a, c);
        return Math.abs(d - 1) * Math.min(a, c) <= tol + o.size / 2;
      }
      default: { // rect, highlight, pixelate
        const b = TS.box(o), t = tol + (o.type === 'rect' ? o.size / 2 : 0);
        const outer = x >= b.x - t && x <= b.x + b.w + t && y >= b.y - t && y <= b.y + b.h + t;
        if (!outer) return false;
        if (o.type !== 'rect' || o.fill !== 'none') return true;
        return !(x > b.x + t && x < b.x + b.w - t && y > b.y + t && y < b.y + b.h - t);
      }
    }
  };

  /* ---------- History (state snapshots) ---------- */
  TS.History = class {
    constructor(limit = 80) { this.limit = limit; this.reset(null); }
    reset(state) { this.states = state ? [state] : []; this.i = this.states.length - 1; }
    push(state) {
      this.states.length = this.i + 1;
      this.states.push(state);
      if (this.states.length > this.limit) this.states.shift();
      this.i = this.states.length - 1;
    }
    get canUndo() { return this.i > 0; }
    get canRedo() { return this.i < this.states.length - 1; }
    undo() { return this.canUndo ? this.states[--this.i] : null; }
    redo() { return this.canRedo ? this.states[++this.i] : null; }
  };
})(window);
