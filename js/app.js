/* tandai-ss — application controller */
(function () {
  'use strict';
  const { clamp } = TS;
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];

  const cv = $('#canvas'), ctx = cv.getContext('2d');
  const stage = $('#stage'), empty = $('#empty');

  /* pages: one entry per screenshot, each with its own objects + undo history */
  const pages = [];
  let cur = -1;
  let doc = { base: null, objects: [] };
  let hist = new TS.History();
  const S = {
    tool: 'rect', color: '#ef4444', size: 4, fill: 'none',
    sel: null, scale: 1, drag: null, crop: null, nextId: 1, editor: null, hlPrev: null
  };

  /* evidence settings (stamp + file naming), persisted */
  const loadMeta = () => { try { return JSON.parse(localStorage.getItem('tandai-meta')) || {}; } catch (e) { return {}; } };
  const saveMeta = () => { try { localStorage.setItem('tandai-meta', JSON.stringify(META)); } catch (e) { /* ignore */ } };
  const META = Object.assign({ on: true, ref: '', author: '', time: true, num: true, pos: 'br' }, loadMeta());

  function getStamp(i) {
    if (!META.on || i < 0 || !pages[i]) return null;
    const parts = [];
    if (META.ref.trim()) parts.push(META.ref.trim());
    if (META.author.trim()) parts.push(META.author.trim());
    if (META.time) parts.push(TS.humanTime(pages[i].time));
    if (META.num && pages.length > 1) parts.push(`${i + 1}/${pages.length}`);
    return parts.length ? { text: parts.join('  |  '), pos: META.pos } : null;
  }

  /* ================= helpers ================= */
  const getSel = () => doc.objects.find(o => o.id === S.sel) || null;

  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg; t.className = 'toast show' + (err ? ' err' : '');
    clearTimeout(t._h); t._h = setTimeout(() => t.className = 'toast', 2200);
  }

  function pos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height };
  }

  function render() {
    if (!doc.base) return;
    const d = S.drag && S.drag.kind === 'draw' ? S.drag.obj : null;
    TS.render(ctx, doc, { hideId: S.editor ? S.editor.id : null, draft: d, stamp: getStamp(cur) });
    TS.overlay(ctx, doc, { sel: getSel(), draft: d, crop: S.crop, k: 1 / S.scale, hideSel: !!S.editor });
  }

  const snap = () => ({ base: doc.base, objects: TS.clone(doc.objects) });

  function commit() { hist.push(snap()); syncUI(); refreshThumb(); }

  function restore(s) {
    if (!s) return;
    const resized = !doc.base || doc.base.width !== s.base.width || doc.base.height !== s.base.height;
    doc.base = s.base; doc.objects = TS.clone(s.objects);
    if (!getSel()) S.sel = null;
    if (resized) setupCanvas();
    syncUI(); render(); refreshThumb();
  }

  /* ================= canvas / image ================= */
  S.zoom = null;      // null = fit-to-window, otherwise explicit scale
  S.fitScale = 1;
  S.mode = 'pixel';   // censor style for new pixelate objects: pixel | blur | black
  S.pan = null;
  let spaceDown = false;
  const viewport = $('#viewport');
  const toolCursor = () => S.tool === 'select' ? 'default' : S.tool === 'text' ? 'text' : 'crosshair';

  function setupCanvas() {
    cv.width = doc.base.width; cv.height = doc.base.height;
    fit();
    $('#stSize').textContent = `${cv.width} × ${cv.height} px`;
  }

  function applyScale() {
    cv.style.width = Math.round(cv.width * S.scale) + 'px';
    cv.style.height = Math.round(cv.height * S.scale) + 'px';
    cv.style.imageRendering = S.scale >= 2 ? 'pixelated' : 'auto';
    $('#stZoom').textContent = Math.round(S.scale * 100) + '%';
  }

  function fit() {
    if (!doc.base) return;
    const aw = stage.clientWidth - 48, ah = stage.clientHeight - 48;
    S.fitScale = Math.min(aw / cv.width, ah / cv.height, 1);
    S.scale = S.zoom ?? S.fitScale;
    applyScale();
    render();
  }

  /* Zoom keeping the image point under (ax, ay) fixed; defaults to the viewport centre. */
  function setZoom(z, ax, ay) {
    if (!doc.base) return;
    commitEditor();
    z = clamp(z, 0.05, 8);
    const sr = stage.getBoundingClientRect();
    if (ax == null) { ax = sr.left + stage.clientWidth / 2; ay = sr.top + stage.clientHeight / 2; }
    const r = cv.getBoundingClientRect();
    const ix = (ax - r.left) / S.scale, iy = (ay - r.top) / S.scale;
    S.zoom = Math.abs(z - S.fitScale) < 1e-3 ? null : z;
    S.scale = S.zoom ?? S.fitScale;
    applyScale();
    const r2 = cv.getBoundingClientRect();
    viewport.scrollLeft += (r2.left + ix * S.scale) - ax;
    viewport.scrollTop += (r2.top + iy * S.scale) - ay;
    render();
  }

  function zoomFit() { S.zoom = null; viewport.scrollLeft = 0; viewport.scrollTop = 0; fit(); }

  /* ================= pages (multi-image) ================= */
  const strip = $('#strip');

  const readImage = file => new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      const b = document.createElement('canvas');
      b.width = im.naturalWidth; b.height = im.naturalHeight;
      b.getContext('2d').drawImage(im, 0, 0);
      res(b);
    };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
    im.src = url;
  });

  async function loadFiles(files) {
    const list = [...files].filter(f => f && f.type.startsWith('image/'));
    if (!list.length) return toast('File bukan gambar', true);
    let added = 0;
    for (const f of list) {
      try { addPage(await readImage(f)); added++; }
      catch (e) { toast('Gagal memuat ' + (f.name || 'gambar'), true); }
    }
    if (added > 1) toast(`${added} gambar ditambahkan`);
  }

  function addPage(base) {
    commitEditor(); cancelCrop();
    const page = { doc: { base, objects: [] }, hist: new TS.History(), time: new Date() };
    page.hist.reset({ base, objects: [] });
    pages.push(page);
    S.size = clamp(Math.round(base.width / 450), 2, 8);
    switchPage(pages.length - 1);
  }

  function switchPage(i) {
    commitEditor(); cancelCrop();
    cur = i; S.sel = null; S.drag = null; S.zoom = null;
    if (i < 0) {
      doc = { base: null, objects: [] }; hist = new TS.History();
      cv.hidden = true; empty.hidden = false;
      $('#stSize').textContent = 'Belum ada gambar'; $('#stZoom').textContent = '';
      renderStrip(); syncUI(); return;
    }
    doc = pages[i].doc; hist = pages[i].hist;
    empty.hidden = true; cv.hidden = false;
    renderStrip(); setupCanvas(); syncUI(); render();
  }

  function removePage(i) {
    if (!confirm(`Hapus gambar ${i + 1} beserta anotasinya?`)) return;
    pages.splice(i, 1);
    switchPage(pages.length ? Math.min(i, pages.length - 1) : -1);
  }

  /* Render a page at full resolution (with optional evidence stamp). */
  function renderPage(i, withStamp = true) {
    const d = pages[i].doc, c = document.createElement('canvas');
    c.width = d.base.width; c.height = d.base.height;
    TS.render(c.getContext('2d'), d, { stamp: withStamp ? getStamp(i) : null });
    return c;
  }

  function drawThumb(i, el) {
    const c = renderPage(i, false);
    const k = Math.min(112 / c.width, 70 / c.height, 1);
    el.width = Math.max(1, Math.round(c.width * k)); el.height = Math.max(1, Math.round(c.height * k));
    el.getContext('2d').drawImage(c, 0, 0, el.width, el.height);
  }

  let thumbTimer;
  function refreshThumb() {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(() => {
      const el = strip.children[cur] && strip.children[cur].querySelector('canvas');
      if (el && pages[cur]) drawThumb(cur, el);
    }, 250);
  }

  function renderStrip() {
    strip.hidden = pages.length === 0;
    strip.innerHTML = '';
    pages.forEach((p, i) => {
      const t = document.createElement('div');
      t.className = 'tile' + (i === cur ? ' active' : '');
      const c = document.createElement('canvas'); drawThumb(i, c);
      const n = document.createElement('span'); n.className = 'num'; n.textContent = i + 1;
      const x = document.createElement('button'); x.className = 'x'; x.title = 'Hapus gambar ini'; x.textContent = '×';
      x.addEventListener('click', ev => { ev.stopPropagation(); removePage(i); });
      t.append(c, n, x);
      t.addEventListener('click', () => { if (i !== cur) switchPage(i); });
      strip.appendChild(t);
    });
    const add = document.createElement('button');
    add.className = 'tile add'; add.title = 'Tambah gambar (atau Ctrl+V)'; add.textContent = '+';
    add.addEventListener('click', () => $('#fileInput').click());
    strip.appendChild(add);
    if (doc.base) fit();
  }

  /* ================= export ================= */
  const baseName = () => TS.safeName(META.ref) || 'tandai';
  const toPng = c => new Promise(r => c.toBlob(r, 'image/png'));

  function download(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  async function save() {
    if (cur < 0) return;
    commitEditor();
    download(await toPng(renderPage(cur)), `${baseName()}_${TS.fileStamp(pages[cur].time)}.png`);
    toast('PNG tersimpan');
  }

  async function saveAll() {
    if (pages.length < 2) return save();
    commitEditor();
    toast('Menyiapkan ZIP…');
    const lines = ['tandai-ss evidence manifest', `Dibuat   : ${TS.humanTime(new Date())}`];
    if (META.ref.trim()) lines.push(`Referensi: ${META.ref.trim()}`);
    if (META.author.trim()) lines.push(`Pembuat  : ${META.author.trim()}`);
    lines.push('', 'File | Waktu | SHA-256');
    const files = [];
    for (let i = 0; i < pages.length; i++) {
      const data = new Uint8Array(await (await toPng(renderPage(i))).arrayBuffer());
      const name = `${baseName()}_${String(i + 1).padStart(2, '0')}_${TS.fileStamp(pages[i].time)}.png`;
      const hash = await TS.sha256(data);
      files.push({ name, data, date: pages[i].time });
      lines.push(`${name} | ${TS.humanTime(pages[i].time)} | ${hash || 'n/a'}`);
    }
    files.push({ name: 'manifest.txt', data: new TextEncoder().encode(lines.join('\r\n')), date: new Date() });
    download(TS.zip(files), `${baseName()}_${TS.fileStamp(new Date())}.zip`);
    toast(`ZIP tersimpan (${pages.length} gambar)`);
  }

  async function copy() {
    if (cur < 0) return;
    commitEditor();
    const blob = await toPng(renderPage(cur));
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      toast('Tersalin ke clipboard');
    } catch (err) {
      toast('Gagal menyalin: ' + err.message, true);
    }
  }

  /* ================= UI sync ================= */
  function syncUI() {
    $('#btnUndo').disabled = !hist.canUndo;
    $('#btnRedo').disabled = !hist.canRedo;
    $('#btnCopy').disabled = !doc.base;
    $('#btnSave').disabled = !doc.base;
    $('#btnZip').hidden = pages.length < 2;
    $('#btnZip').textContent = `ZIP (${pages.length})`;
    $('#btnClear').disabled = !doc.objects.length;
    $('#btnDup').disabled = !getSel();
    $('#btnDel').disabled = !getSel();
    $$('#rail button').forEach(b => b.classList.toggle('active', b.dataset.tool === S.tool));
    $$('#swatches button').forEach(b => b.classList.toggle('active', b.dataset.color === S.color));
    $('#colorPick').value = S.color;
    $('#size').value = S.size; $('#sizeOut').textContent = S.size;
    $$('#fillSeg button').forEach(b => b.classList.toggle('active', b.dataset.fill === S.fill));
    $$('#modeSeg button').forEach(b => b.classList.toggle('active', b.dataset.mode === S.mode));
    $('#cropBar').hidden = !(S.crop && S.crop.ready);
  }

  /* Load the properties of the selected object into the panel. */
  function adoptSelection() {
    const o = getSel();
    if (!o) return;
    S.color = o.color; S.size = o.size;
    if (o.type === 'rect' || o.type === 'ellipse' || o.type === 'text') S.fill = o.fill;
    if (o.type === 'pixelate') S.mode = o.mode || 'pixel';
  }

  function setTool(t) {
    commitEditor();
    cancelCrop();
    if (S.tool === 'highlight' && t !== 'highlight' && S.hlPrev && S.color === '#facc15') S.color = S.hlPrev;
    if (t === 'highlight' && S.tool !== 'highlight') { S.hlPrev = S.color; S.color = '#facc15'; }
    S.tool = t;
    if (t !== 'select') S.sel = null;
    cv.style.cursor = t === 'select' ? 'default' : t === 'text' ? 'text' : 'crosshair';
    syncUI(); render();
  }

  /* Apply a property change to the selected object (if any). */
  function applyProp(key, val, final = true) {
    S[key] = val;
    const o = getSel();
    const applies = !o ? false : key === 'fill' ? ['rect', 'ellipse', 'text'].includes(o.type)
                    : key === 'mode' ? o.type === 'pixelate' : true;
    if (o && applies) {
      o[key] = val;
      if (final) commit();
      render();
    }
    syncUI();
  }

  /* ================= inline text editor ================= */
  function openEditor(id, p) {
    commitEditor();
    const existing = id ? doc.objects.find(o => o.id === id) : null;
    const o = existing || { id: -1, type: 'text', x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: S.color, size: S.size, fill: S.fill, text: '' };
    const r = cv.getBoundingClientRect(), k = r.width / cv.width;
    const ta = document.createElement('textarea');
    ta.id = 'textEditor'; ta.spellcheck = false; ta.value = o.text;
    ta.style.left = (r.left + o.x1 * k) + 'px';
    ta.style.top = (r.top + o.y1 * k) + 'px';
    ta.style.font = TS.fontCss(o, k);
    ta.style.lineHeight = (TS.fontPx(o) * 1.25 * k) + 'px';
    ta.style.padding = (TS.textPad(o) * k) + 'px';
    ta.style.color = o.color;
    const size = () => {
      const b = TS.textBox({ ...o, text: ta.value || ' ' });
      ta.style.width = (b.w * k + TS.fontPx(o) * k) + 'px';
      ta.style.height = (b.h * k) + 'px';
    };
    ta.addEventListener('input', size);
    ta.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); commitEditor(); }
      else if (ev.key === 'Escape') { ev.preventDefault(); commitEditor(true); }
    });
    ta.addEventListener('blur', () => commitEditor());
    document.body.appendChild(ta);
    S.editor = { ta, id: existing ? existing.id : null, proto: o };
    size(); render(); ta.focus(); ta.select();
  }

  function commitEditor(cancel) {
    const e = S.editor;
    if (!e) return;
    S.editor = null;
    const text = e.ta.value.replace(/\s+$/, '');
    e.ta.remove();
    if (!cancel) {
      if (e.id) {
        const o = doc.objects.find(x => x.id === e.id);
        if (o && text !== o.text) {
          if (text) o.text = text; else { doc.objects = doc.objects.filter(x => x !== o); S.sel = null; }
          commit();
        }
      } else if (text) {
        const o = { ...e.proto, id: S.nextId++, text };
        doc.objects.push(o); S.sel = o.id; commit();
      }
    }
    syncUI(); render();
  }

  /* ================= crop ================= */
  function cancelCrop() { S.crop = null; if (S.drag && S.drag.kind === 'crop') S.drag = null; syncUI(); render(); }

  function applyCrop() {
    if (!S.crop || !S.crop.ready) return;
    const b = TS.box(S.crop);
    const x = Math.round(clamp(b.x, 0, doc.base.width)), y = Math.round(clamp(b.y, 0, doc.base.height));
    const w = Math.round(clamp(b.x + b.w, 0, doc.base.width)) - x, h = Math.round(clamp(b.y + b.h, 0, doc.base.height)) - y;
    if (w < 4 || h < 4) return cancelCrop();
    const nb = document.createElement('canvas'); nb.width = w; nb.height = h;
    nb.getContext('2d').drawImage(doc.base, x, y, w, h, 0, 0, w, h);
    for (const o of doc.objects) { o.x1 -= x; o.x2 -= x; o.y1 -= y; o.y2 -= y; }
    doc.base = nb; S.crop = null; S.sel = null;
    setupCanvas(); commit(); render();
    toast(`Dipotong menjadi ${w} × ${h}`);
  }

  /* ================= pointer input ================= */
  const nextStep = () => doc.objects.reduce((m, o) => o.type === 'step' ? Math.max(m, +o.text) : m, 0) + 1;

  function newObj(type, p) {
    return { id: S.nextId++, type, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: S.color, size: S.size, fill: S.fill, mode: S.mode, text: '' };
  }

  const topHit = p => {
    const tol = 6 / S.scale;
    for (let i = doc.objects.length - 1; i >= 0; i--) if (TS.hit(doc.objects[i], p.x, p.y, tol)) return doc.objects[i];
    return null;
  };

  const handleHit = (o, p) => {
    const tol = 9 / S.scale;
    const h = TS.handles(o).find(h => Math.abs(p.x - h.x) <= tol && Math.abs(p.y - h.y) <= tol);
    return h ? h.id : null;
  };

  cv.addEventListener('mousedown', e => e.preventDefault());

  cv.addEventListener('pointerdown', e => {
    if (doc.base && (e.button === 1 || (e.button === 0 && spaceDown))) {
      S.pan = { x: e.clientX, y: e.clientY, l: viewport.scrollLeft, t: viewport.scrollTop };
      cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing';
      return;
    }
    if (!doc.base || e.button !== 0) return;
    commitEditor();
    cv.setPointerCapture(e.pointerId);
    const p = pos(e);

    if (S.tool === 'select') {
      const cur = getSel();
      const hid = cur && handleHit(cur, p);
      if (hid) { S.drag = { kind: 'resize', id: cur.id, handle: hid, orig: TS.clone(cur), moved: false }; return; }
      const hit = topHit(p);
      S.sel = hit ? hit.id : null;
      if (hit) { adoptSelection(); S.drag = { kind: 'move', id: hit.id, orig: TS.clone(hit), start: p, moved: false }; }
      syncUI(); render(); return;
    }

    if (S.tool === 'text') {
      const hit = topHit(p);
      hit && hit.type === 'text' ? openEditor(hit.id) : openEditor(null, p);
      return;
    }

    if (S.tool === 'step') {
      const o = newObj('step', p); o.text = String(nextStep());
      doc.objects.push(o); S.sel = null; commit(); render(); return;
    }

    if (S.tool === 'crop') {
      S.crop = { x1: p.x, y1: p.y, x2: p.x, y2: p.y, ready: false };
      S.drag = { kind: 'crop' }; syncUI(); render(); return;
    }

    S.sel = null;
    S.drag = { kind: 'draw', obj: newObj(S.tool, p) };
    render();
  });

  cv.addEventListener('pointermove', e => {
    if (S.pan) {
      viewport.scrollLeft = S.pan.l - (e.clientX - S.pan.x);
      viewport.scrollTop = S.pan.t - (e.clientY - S.pan.y);
      return;
    }
    if (!doc.base) return;
    const p = pos(e);
    $('#stPos').textContent = `${Math.round(p.x)}, ${Math.round(p.y)}`;
    const d = S.drag;

    if (!d) {
      if (S.tool === 'select') {
        const cur = getSel();
        cv.style.cursor = cur && handleHit(cur, p) ? 'nwse-resize' : topHit(p) ? 'move' : 'default';
      }
      return;
    }

    if (d.kind === 'draw') {
      const o = d.obj;
      if (o.type === 'arrow' && e.shiftKey) {
        const ang = Math.atan2(p.y - o.y1, p.x - o.x1), len = Math.hypot(p.x - o.x1, p.y - o.y1);
        const sn = Math.round(ang / (Math.PI / 4)) * (Math.PI / 4);
        o.x2 = o.x1 + len * Math.cos(sn); o.y2 = o.y1 + len * Math.sin(sn);
      } else if (e.shiftKey && o.type !== 'arrow') {
        const dx = p.x - o.x1, dy = p.y - o.y1, m = Math.max(Math.abs(dx), Math.abs(dy));
        o.x2 = o.x1 + Math.sign(dx || 1) * m; o.y2 = o.y1 + Math.sign(dy || 1) * m;
      } else { o.x2 = p.x; o.y2 = p.y; }
    } else if (d.kind === 'crop') {
      S.crop.x2 = clamp(p.x, 0, cv.width); S.crop.y2 = clamp(p.y, 0, cv.height);
    } else {
      const o = getSel();
      if (!o) return;
      d.moved = true;
      d.kind === 'move' ? TS.translate(o, d.orig, p.x - d.start.x, p.y - d.start.y)
                        : TS.resize(o, d.orig, d.handle, p);
    }
    render();
  });

  cv.addEventListener('pointerup', () => {
    if (S.pan) { S.pan = null; cv.style.cursor = spaceDown ? 'grab' : toolCursor(); return; }
    const d = S.drag; S.drag = null;
    if (!d) return;
    if (d.kind === 'draw') {
      const o = d.obj, k = S.scale;
      const tiny = o.type === 'arrow'
        ? Math.hypot(o.x2 - o.x1, o.y2 - o.y1) * k < 5
        : Math.abs(o.x2 - o.x1) * k < 4 && Math.abs(o.y2 - o.y1) * k < 4;
      if (!tiny) { doc.objects.push(o); S.sel = o.id; commit(); }
    } else if (d.kind === 'crop') {
      const b = TS.box(S.crop);
      if (b.w * S.scale > 8 && b.h * S.scale > 8) S.crop.ready = true; else S.crop = null;
    } else if (d.moved) commit();
    syncUI(); render();
  });

  cv.addEventListener('dblclick', e => {
    if (S.tool !== 'select') return;
    const hit = topHit(pos(e));
    if (hit && hit.type === 'text') openEditor(hit.id);
  });

  /* ================= toolbar wiring ================= */
  $$('#rail button').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  $$('#swatches button').forEach(b => b.addEventListener('click', () => applyProp('color', b.dataset.color)));
  $('#colorPick').addEventListener('input', e => applyProp('color', e.target.value, false));
  $('#colorPick').addEventListener('change', () => { if (getSel()) commit(); });
  $('#size').addEventListener('input', e => applyProp('size', +e.target.value, false));
  $('#size').addEventListener('change', () => { if (getSel()) commit(); });
  $$('#fillSeg button').forEach(b => b.addEventListener('click', () => applyProp('fill', b.dataset.fill)));

  $('#btnUndo').addEventListener('click', () => restore(hist.undo()));
  $('#btnRedo').addEventListener('click', () => restore(hist.redo()));
  $('#btnDel').addEventListener('click', deleteSel);
  $('#btnDup').addEventListener('click', dupSel);
  $('#btnClear').addEventListener('click', () => { doc.objects = []; S.sel = null; commit(); render(); });
  $('#btnSave').addEventListener('click', save);
  $('#btnZip').addEventListener('click', saveAll);
  $('#btnCopy').addEventListener('click', copy);
  $('#cropApply').addEventListener('click', applyCrop);
  $('#cropCancel').addEventListener('click', cancelCrop);

  function deleteSel() {
    const o = getSel(); if (!o) return;
    doc.objects = doc.objects.filter(x => x !== o); S.sel = null; commit(); render();
  }
  function dupSel() {
    const o = getSel(); if (!o) return;
    const c = TS.clone(o); c.id = S.nextId++;
    c.x1 += 16; c.x2 += 16; c.y1 += 16; c.y2 += 16;
    if (c.type === 'step') c.text = String(nextStep());
    doc.objects.push(c); S.sel = c.id; commit(); render();
  }

  /* ================= open / paste / drop ================= */
  const openPicker = () => $('#fileInput').click();
  $('#btnOpen').addEventListener('click', openPicker);
  $('#btnBrowse').addEventListener('click', openPicker);
  $('#fileInput').addEventListener('change', e => { loadFiles(e.target.files); e.target.value = ''; });

  const typing = el => el.matches && el.matches('textarea, input[type=text], select');

  window.addEventListener('paste', e => {
    if (typing(e.target)) return;
    const files = [...(e.clipboardData?.items || [])]
      .filter(it => it.type.startsWith('image/')).map(it => it.getAsFile());
    if (files.length) { loadFiles(files); e.preventDefault(); }
  });

  ['dragenter', 'dragover'].forEach(n => stage.addEventListener(n, e => { e.preventDefault(); empty.classList.add('dragover'); }));
  ['dragleave', 'drop'].forEach(n => stage.addEventListener(n, e => { e.preventDefault(); empty.classList.remove('dragover'); }));
  stage.addEventListener('drop', e => { if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files); });

  /* ================= keyboard ================= */
  const KEYS = { v: 'select', r: 'rect', o: 'ellipse', a: 'arrow', h: 'highlight', t: 'text', n: 'step', b: 'pixelate', c: 'crop' };

  window.addEventListener('keydown', e => {
    if (typing(e.target)) return;
    const k = e.key.toLowerCase();

    if (e.ctrlKey || e.metaKey) {
      if (k === 'z') { e.preventDefault(); restore(e.shiftKey ? hist.redo() : hist.undo()); }
      else if (k === 'y') { e.preventDefault(); restore(hist.redo()); }
      else if (k === 's') { e.preventDefault(); save(); }
      else if (k === 'o') { e.preventDefault(); openPicker(); }
      else if (k === 'd') { e.preventDefault(); dupSel(); }
      else if (k === 'c' && doc.base && !getSelection().toString()) { e.preventDefault(); copy(); }
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') { deleteSel(); return; }
    if (e.key === 'Escape') {
      if (S.crop) cancelCrop(); else { S.sel = null; S.drag = null; syncUI(); render(); }
      return;
    }
    if (e.key === 'Enter' && S.crop && S.crop.ready) { applyCrop(); return; }
    if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(S.scale * 1.25); return; }
    if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoom(S.scale / 1.25); return; }
    if (e.key === '0') { e.preventDefault(); zoomFit(); return; }
    if (e.key === '1') { e.preventDefault(); setZoom(1); return; }
    if (KEYS[k]) { e.preventDefault(); setTool(KEYS[k]); }
  });

  $('#btnTheme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('tandai-theme', next); } catch (e) { /* storage unavailable */ }
  });

  window.addEventListener('resize', () => { commitEditor(); fit(); });

  /* ================= zoom / pan / censor style wiring ================= */
  $('#zIn').addEventListener('click', () => setZoom(S.scale * 1.25));
  $('#zOut').addEventListener('click', () => setZoom(S.scale / 1.25));
  $('#z100').addEventListener('click', () => setZoom(1));
  $('#stZoom').addEventListener('click', zoomFit);

  viewport.addEventListener('wheel', e => {
    if (!(e.ctrlKey || e.metaKey) || !doc.base) return;
    e.preventDefault();
    setZoom(S.scale * Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
  }, { passive: false });
  viewport.addEventListener('scroll', () => commitEditor());

  window.addEventListener('keydown', e => {
    if (e.code !== 'Space' || typing(e.target) || e.repeat) return;
    e.preventDefault(); spaceDown = true;
    if (doc.base && !S.pan) cv.style.cursor = 'grab';
  });
  window.addEventListener('keyup', e => {
    if (e.code !== 'Space') return;
    spaceDown = false;
    if (!S.pan) cv.style.cursor = toolCursor();
  });
  window.addEventListener('blur', () => { spaceDown = false; });

  $$('#modeSeg button').forEach(b => b.addEventListener('click', () => applyProp('mode', b.dataset.mode)));

  /* ================= evidence settings ================= */
  function bindMeta(id, key, isCheck) {
    const el = $(id);
    if (isCheck) el.checked = META[key]; else el.value = META[key];
    el.addEventListener(isCheck ? 'change' : 'input', () => {
      META[key] = isCheck ? el.checked : el.value;
      saveMeta(); render();
    });
  }
  bindMeta('#metaOn', 'on', true);
  bindMeta('#metaRef', 'ref');
  bindMeta('#metaAuthor', 'author');
  bindMeta('#metaTime', 'time', true);
  bindMeta('#metaNum', 'num', true);
  bindMeta('#metaPos', 'pos');

  /* ================= mobile properties drawer ================= */
  const togglePanel = open => {
    const p = $('#panel'), b = $('#panelBackdrop');
    if (!p || !b) return;
    const isNowOpen = open ?? !p.classList.contains('open');
    p.classList.toggle('open', isNowOpen);
    b.classList.toggle('open', isNowOpen);
  };
  $('#btnProps')?.addEventListener('click', () => togglePanel());
  $('#panelClose')?.addEventListener('click', () => togglePanel(false));
  $('#panelBackdrop')?.addEventListener('click', () => togglePanel(false));

  syncUI();
})();
