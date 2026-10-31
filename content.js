(() => {
  if (window.__gridLinesOverlay) return;
  window.__gridLinesOverlay = true;

  const DEFAULTS = globalThis.GRID_DEFAULTS;
  const SNAP_DISTANCE = 6;
  const HISTORY_LIMIT = 100;
  const WHEEL_STEP = 50;
  const isMac = /Mac/.test(navigator.platform);
  const ALT = isMac ? '⌥' : 'Alt';
  const SHIFT = isMac ? '⇧' : 'Shift';

  let settings = { ...DEFAULTS };
  let visible = false;
  let drawing = false;
  let lines = []; // { id, axis: 'x' | 'y', pos } — pos is in document coordinates
  let nextId = 1;
  let history = [];
  let selectedId = null;
  let mouse = null; // last pointer position + modifiers, viewport coordinates
  let hover = null; // snapped cursor + picked element, viewport coordinates
  let hoverLineId = null;
  let drag = null; // { id, moved, fresh }
  let pickBase = null;
  let pickDepth = 0;
  let wheelAcc = 0;
  let frame = 0;

  // ---------------------------------------------------------------- DOM

  // An older copy can linger after the extension is reloaded.
  document.querySelectorAll('grid-lines-overlay').forEach((el) => el.remove());

  const host = document.createElement('grid-lines-overlay');
  host.style.cssText =
    'all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;display:none;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      :host { --c: #ff2d55; }
      * { box-sizing: border-box; }
      .layer { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
      .capture { position: absolute; inset: 0; pointer-events: none; cursor: crosshair; }
      :host(.drawing) .capture { pointer-events: auto; }

      .col {
        position: absolute; top: 0; bottom: 0;
        background: color-mix(in srgb, var(--c) 8%, transparent);
        border-left: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
        border-right: 1px solid color-mix(in srgb, var(--c) 30%, transparent);
      }
      .baseline {
        background-image: linear-gradient(to bottom, transparent calc(100% - 1px),
          color-mix(in srgb, var(--c) 25%, transparent) calc(100% - 1px));
      }

      .line { position: absolute; pointer-events: none; }
      :host(.drawing) .line { pointer-events: auto; }
      .line.x { top: 0; bottom: 0; width: 9px; margin-left: -4px; cursor: ew-resize; }
      .line.y { left: 0; right: 0; height: 9px; margin-top: -4px; cursor: ns-resize; }
      .line::before { content: ""; position: absolute; background: var(--c); }
      .line.x::before { left: 4px; top: 0; bottom: 0; width: 1px; }
      .line.y::before { top: 4px; left: 0; right: 0; height: 1px; }
      :host(.drawing) .line:hover::before,
      :host(.drawing) .line.selected::before {
        box-shadow: 0 0 0 1px color-mix(in srgb, var(--c) 40%, transparent);
      }

      .measure { position: absolute; pointer-events: none; }
      .measure.h { height: 0; border-top: 1px dashed var(--c); }
      .measure.v { width: 0; border-left: 1px dashed var(--c); }
      .pill {
        position: absolute; transform: translate(-50%, -50%);
        padding: 1px 5px; border-radius: 4px; white-space: nowrap;
        font: 600 10px/14px ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #fff; color: var(--c); box-shadow: 0 0 0 1px var(--c);
      }
      .measure.h .pill { left: 50%; top: 0; }
      .measure.v .pill { top: 50%; left: 0; }
      .pill.eq { background: var(--c); color: #fff; }

      .guide { position: absolute; display: none; pointer-events: none; opacity: 0.35; }
      .gx { top: 0; bottom: 0; width: 0; border-left: 1px dashed var(--c); }
      .gy { left: 0; right: 0; height: 0; border-top: 1px dashed var(--c); }
      .guide.on { opacity: 1; }
      .guide.snap { border-style: solid; }
      .box {
        position: absolute; display: none; pointer-events: none;
        background: color-mix(in srgb, var(--c) 12%, transparent); outline: 1px solid var(--c);
      }

      .tip {
        position: absolute; left: 0; top: 0; display: none; pointer-events: none;
        padding: 3px 7px; border-radius: 5px; white-space: nowrap;
        font: 500 11px/16px ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #16141f; color: #fff; box-shadow: 0 0 0 1px rgba(255,255,255,.15), 0 4px 12px rgba(0,0,0,.2);
      }
      .tip b { color: #ff7a95; font-weight: 600; }
      .tip i { color: #8f8a9e; font-style: normal; }

      .hud {
        position: absolute; left: 50%; bottom: 16px; transform: translateX(-50%);
        display: none; align-items: center; gap: 12px; padding: 6px 6px 6px 14px;
        border-radius: 10px; white-space: nowrap; pointer-events: auto; cursor: default;
        background: rgba(22, 20, 31, .94); color: #cfcbd9;
        font: 12px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 8px 28px rgba(0,0,0,.28), 0 0 0 1px rgba(255,255,255,.08);
      }
      :host(.drawing) .hud { display: flex; }
      .hud.top { bottom: auto; top: 16px; }
      .hud .hint { display: flex; gap: 12px; }
      .hud kbd {
        font: inherit; font-weight: 600; color: #fff; margin-right: 3px;
        background: rgba(255,255,255,.12); border-radius: 4px; padding: 1px 5px;
      }
      .hud .count { color: #8f8a9e; font-variant-numeric: tabular-nums; }
      .hud .actions { display: flex; gap: 4px; }
      .hud button {
        all: unset; cursor: pointer; padding: 5px 10px; border-radius: 6px;
        background: rgba(255,255,255,.1); color: #fff; font-weight: 500;
      }
      .hud button:hover { background: rgba(255,255,255,.2); }
      .hud button.primary { background: var(--c); }
      .hud button.primary:hover { filter: brightness(1.1); }
      @media (max-width: 960px) { .hud .hint { display: none; } }
    </style>
    <div class="layer columns"></div>
    <div class="layer baseline"></div>
    <div class="capture"></div>
    <div class="box"></div>
    <div class="guide gx"></div>
    <div class="guide gy"></div>
    <div class="layer lines"></div>
    <div class="layer labels"></div>
    <div class="tip"></div>
    <div class="hud">
      <span class="hint">
        <span><kbd>Click</kbd>vertical</span>
        <span><kbd>${SHIFT} Click</kbd>horizontal</span>
        <span><kbd>${ALT} Click</kbd>element box</span>
        <span><kbd>Right-click</kbd>delete</span>
      </span>
      <span class="count"></span>
      <span class="actions">
        <button data-act="undo">Undo</button>
        <button data-act="clear">Clear</button>
        <button data-act="done" class="primary">Done</button>
      </span>
    </div>`;

  const $ = (sel) => shadow.querySelector(sel);
  const ui = {
    columns: $('.columns'),
    baseline: $('.baseline'),
    lines: $('.lines'),
    labels: $('.labels'),
    gx: $('.gx'),
    gy: $('.gy'),
    box: $('.box'),
    tip: $('.tip'),
    hud: $('.hud'),
    count: $('.count'),
  };
  const lineEls = new Map();

  // ---------------------------------------------------------------- rendering

  function schedule() {
    if (!frame) frame = requestAnimationFrame(render);
  }

  function render() {
    frame = 0;
    if (!visible) return;
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    renderColumns(vw);
    renderBaseline();
    renderLines();
    renderLabels(vw, vh);
    renderCursor(vw, vh);
    renderHud(vh);
  }

  function renderColumns(vw) {
    const layer = ui.columns;
    layer.style.display = settings.columns ? 'block' : 'none';
    if (!settings.columns) return;
    const count = Math.max(1, Math.round(settings.columnCount) || 1);
    const gutter = Math.max(0, Number(settings.gutter) || 0);
    const margin = Math.max(0, Number(settings.margin) || 0);
    const max = Number(settings.maxWidth) > 0 ? Number(settings.maxWidth) : Infinity;
    const signature = [vw, count, gutter, margin, max].join();
    if (layer.dataset.signature === signature) return;
    layer.dataset.signature = signature;

    const width = Math.max(0, Math.min(max, vw - margin * 2));
    const left = (vw - width) / 2;
    const colWidth = Math.max(0, (width - gutter * (count - 1)) / count);
    layer.replaceChildren();
    for (let i = 0; i < count; i++) {
      const col = document.createElement('div');
      col.className = 'col';
      col.style.left = `${left + i * (colWidth + gutter)}px`;
      col.style.width = `${colWidth}px`;
      layer.append(col);
    }
  }

  function renderBaseline() {
    const layer = ui.baseline;
    layer.style.display = settings.baseline ? 'block' : 'none';
    if (!settings.baseline) return;
    const step = Math.max(2, Number(settings.baselineStep) || 8);
    layer.style.backgroundSize = `100% ${step}px`;
    layer.style.backgroundPosition = `0 ${-window.scrollY}px`;
  }

  function renderLines() {
    const seen = new Set();
    for (const line of lines) {
      let el = lineEls.get(line.id);
      if (!el) {
        el = document.createElement('div');
        el.dataset.id = line.id;
        ui.lines.append(el);
        lineEls.set(line.id, el);
      }
      el.className = `line ${line.axis}${line.id === selectedId ? ' selected' : ''}`;
      if (line.axis === 'x') el.style.left = `${Math.round(line.pos - window.scrollX)}px`;
      else el.style.top = `${Math.round(line.pos - window.scrollY)}px`;
      seen.add(line.id);
    }
    for (const [id, el] of lineEls) {
      if (!seen.has(id)) {
        el.remove();
        lineEls.delete(id);
      }
    }
  }

  // Gaps between neighbouring lines. Gaps that repeat (±1px) are filled in,
  // which is what makes a consistent spacing system jump out.
  function gaps(axis) {
    const positions = lines
      .filter((l) => l.axis === axis)
      .map((l) => l.pos)
      .sort((a, b) => a - b);
    const out = [];
    for (let i = 1; i < positions.length; i++) {
      const size = positions[i] - positions[i - 1];
      if (size >= 1) out.push({ start: positions[i - 1], size });
    }
    for (const gap of out) gap.repeated = out.some((o) => o !== gap && Math.abs(o.size - gap.size) <= 1);
    return out;
  }

  function measure(direction, start, size, gap) {
    const el = document.createElement('div');
    el.className = `measure ${direction}`;
    if (direction === 'h') {
      el.style.cssText = `left:${start}px;top:14px;width:${size}px`;
    } else {
      el.style.cssText = `top:${start}px;left:14px;height:${size}px`;
    }
    const pill = document.createElement('span');
    pill.className = gap.repeated ? 'pill eq' : 'pill';
    pill.textContent = Math.round(gap.size);
    el.append(pill);
    return el;
  }

  function renderLabels(vw, vh) {
    ui.labels.replaceChildren();
    if (!settings.spacing) return;
    for (const gap of gaps('x')) {
      const start = gap.start - window.scrollX;
      if (start + gap.size >= 0 && start <= vw) ui.labels.append(measure('h', start, gap.size, gap));
    }
    for (const gap of gaps('y')) {
      const start = gap.start - window.scrollY;
      if (start + gap.size >= 0 && start <= vh) ui.labels.append(measure('v', start, gap.size, gap));
    }
  }

  function setTip(...parts) {
    ui.tip.replaceChildren(
      ...parts.map(([tag, text]) => {
        if (!tag) return document.createTextNode(text);
        const el = document.createElement(tag);
        el.textContent = text;
        return el;
      }),
    );
  }

  function renderCursor(vw, vh) {
    const active = drawing && hover;
    const picking = active && mouse.alt && !drag;
    const guides = active && !picking;
    ui.gx.style.display = ui.gy.style.display = guides ? 'block' : 'none';
    ui.box.style.display = picking && hover.el ? 'block' : 'none';
    ui.tip.style.display = active ? 'block' : 'none';
    if (!active) return;

    const dragLine = drag && lines.find((l) => l.id === drag.id);
    if (guides) {
      const horizontal = dragLine ? dragLine.axis === 'y' : mouse.shift;
      ui.gx.style.left = `${Math.round(hover.x)}px`;
      ui.gy.style.top = `${Math.round(hover.y)}px`;
      ui.gx.classList.toggle('on', !horizontal);
      ui.gy.classList.toggle('on', horizontal);
      ui.gx.classList.toggle('snap', hover.snapX);
      ui.gy.classList.toggle('snap', hover.snapY);
    }

    const hoveredLine = !drag && lines.find((l) => l.id === hoverLineId);
    if (picking && hover.el) {
      const r = hover.el.getBoundingClientRect();
      Object.assign(ui.box.style, {
        left: `${r.left}px`,
        top: `${r.top}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
      setTip(
        ['', `${describe(hover.el)}  `],
        ['b', `${Math.round(r.width)}×${Math.round(r.height)}`],
        ['i', '  scroll ↕ to change'],
      );
    } else if (dragLine) {
      setTip(['', `${dragLine.axis} `], ['b', String(Math.round(dragLine.pos))]);
    } else if (hoveredLine) {
      setTip(
        ['', `${hoveredLine.axis} `],
        ['b', String(Math.round(hoveredLine.pos))],
        ['i', '  drag · right-click deletes'],
      );
    } else {
      setTip(
        ['b', `${Math.round(hover.x + window.scrollX)}, ${Math.round(hover.y + window.scrollY)}`],
        ['i', hover.snapX || hover.snapY ? '  snapped' : ''],
      );
    }

    const w = ui.tip.offsetWidth;
    const h = ui.tip.offsetHeight;
    let tx = mouse.x + 14;
    let ty = mouse.y + 18;
    if (tx + w > vw - 8) tx = mouse.x - w - 14;
    if (ty + h > vh - 8) ty = mouse.y - h - 12;
    ui.tip.style.transform = `translate(${tx}px, ${ty}px)`;
  }

  function renderHud(vh) {
    if (!drawing) return;
    ui.count.textContent = `${lines.length} line${lines.length === 1 ? '' : 's'}`;
    // Get out of the way when the cursor heads for the bottom of the page.
    ui.hud.classList.toggle('top', !!mouse && mouse.y > vh - 90);
  }

  function describe(el) {
    let label = el.tagName.toLowerCase();
    if (el.id) label += `#${el.id}`;
    else if (typeof el.className === 'string' && el.className.trim()) {
      label += `.${el.className.trim().split(/\s+/)[0]}`;
    }
    return label.length > 40 ? `${label.slice(0, 39)}…` : label;
  }

  // ---------------------------------------------------------------- snapping & picking

  function textRect(el) {
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim(),
    );
    if (!hasText) return null;
    const range = document.createRange();
    range.selectNodeContents(el);
    return range.getBoundingClientRect();
  }

  function nearest(value, candidates) {
    let best = null;
    let bestDistance = SNAP_DISTANCE + 0.01;
    for (const c of candidates) {
      const d = Math.abs(c - value);
      if (d < bestDistance) {
        best = c;
        bestDistance = d;
      }
    }
    return best;
  }

  function ancestor(el, depth) {
    for (let i = 0; i < depth && el?.parentElement && el.parentElement !== document.body; i++) {
      el = el.parentElement;
    }
    return el;
  }

  function maxDepth(el) {
    let depth = 0;
    while (el?.parentElement && el.parentElement !== document.body && el.parentElement !== document.documentElement) {
      el = el.parentElement;
      depth++;
    }
    return depth;
  }

  function pick(x, y) {
    const stack = document
      .elementsFromPoint(x, y)
      .filter((el) => el !== host && el !== document.documentElement && el !== document.body);
    const top = stack[0] || null;
    if (top !== pickBase) {
      pickBase = top;
      pickDepth = 0;
    }
    const result = { x, y, snapX: false, snapY: false, el: ancestor(top, pickDepth) };
    if (!settings.snap || mouse.alt) return result;

    const xs = [];
    const ys = [];
    const addRect = (r) => {
      if (!r || (!r.width && !r.height)) return;
      xs.push(r.left, r.right, (r.left + r.right) / 2);
      ys.push(r.top, r.bottom, (r.top + r.bottom) / 2);
    };
    stack.slice(0, 4).forEach((el) => addRect(el.getBoundingClientRect()));
    if (top) addRect(textRect(top));

    const sx = nearest(x, xs);
    const sy = nearest(y, ys);
    if (sx !== null) Object.assign(result, { x: sx, snapX: true });
    if (sy !== null) Object.assign(result, { y: sy, snapY: true });
    return result;
  }

  function track() {
    if (!mouse) {
      hover = null;
      return;
    }
    hover = pick(mouse.x, mouse.y);
    const line = drag && lines.find((l) => l.id === drag.id);
    if (line) {
      const pos = line.axis === 'x' ? hover.x + window.scrollX : hover.y + window.scrollY;
      if (pos !== line.pos) {
        line.pos = pos;
        drag.moved = true;
      }
    }
  }

  // ---------------------------------------------------------------- line state

  function checkpoint() {
    history.push(lines.map((l) => ({ ...l })));
    if (history.length > HISTORY_LIMIT) history.shift();
  }

  function addLine(axis, pos) {
    const existing = lines.find((l) => l.axis === axis && Math.abs(l.pos - pos) < 0.5);
    if (existing) return existing;
    const line = { id: nextId++, axis, pos };
    lines.push(line);
    return line;
  }

  function addBox(el) {
    const r = el.getBoundingClientRect();
    const count = lines.length;
    checkpoint();
    addLine('x', r.left + window.scrollX);
    addLine('x', r.right + window.scrollX);
    addLine('y', r.top + window.scrollY);
    addLine('y', r.bottom + window.scrollY);
    if (lines.length === count) history.pop();
    save();
  }

  function removeLine(id) {
    checkpoint();
    lines = lines.filter((l) => l.id !== id);
    if (selectedId === id) selectedId = null;
    save();
    schedule();
  }

  function clearLines() {
    if (!lines.length) return;
    checkpoint();
    lines = [];
    selectedId = null;
    save();
    schedule();
  }

  function undo() {
    const previous = history.pop();
    if (!previous) return;
    lines = previous;
    selectedId = null;
    save();
    schedule();
  }

  function nudge(key, step) {
    const line = lines.find((l) => l.id === selectedId);
    const horizontalKey = key === 'arrowleft' || key === 'arrowright';
    if (!line || (line.axis === 'x') !== horizontalKey) return false;
    checkpoint();
    line.pos += key === 'arrowright' || key === 'arrowdown' ? step : -step;
    save();
    schedule();
    return true;
  }

  // ---------------------------------------------------------------- mode

  function apply() {
    if (!host.isConnected) document.documentElement.append(host);
    if (!drawing) {
      mouse = hover = drag = null;
      selectedId = null;
    }
    host.style.display = visible ? 'block' : 'none';
    host.classList.toggle('drawing', drawing);
    chrome.runtime.sendMessage({ type: 'status', visible, drawing }).catch(() => {});
    schedule();
  }

  function setVisible(value) {
    visible = value;
    if (!visible) drawing = false;
    apply();
  }

  function setDrawing(value) {
    drawing = value;
    if (drawing) visible = true;
    apply();
  }

  // ---------------------------------------------------------------- input

  const pointer = (e) => ({ x: e.clientX, y: e.clientY, shift: e.shiftKey, alt: e.altKey });

  shadow.addEventListener('pointerdown', (e) => {
    if (!drawing || e.button !== 0 || e.target.closest('.hud')) return;
    e.preventDefault();
    mouse = pointer(e);
    track();
    const lineEl = e.target.closest('.line');
    if (lineEl) {
      checkpoint();
      drag = { id: Number(lineEl.dataset.id), moved: false, fresh: false };
    } else if (e.altKey) {
      if (hover.el) addBox(hover.el);
    } else {
      checkpoint();
      const count = lines.length;
      const horizontal = e.shiftKey;
      const line = addLine(
        horizontal ? 'y' : 'x',
        horizontal ? hover.y + window.scrollY : hover.x + window.scrollX,
      );
      // Pressing and dragging keeps moving the new line until release.
      drag = { id: line.id, moved: false, fresh: lines.length > count };
    }
    if (drag) selectedId = drag.id;
    schedule();
  });

  window.addEventListener(
    'pointermove',
    (e) => {
      if (!drawing) return;
      mouse = pointer(e);
      const target = e.composedPath()[0];
      hoverLineId = target?.classList?.contains('line') ? Number(target.dataset.id) : null;
      track();
      schedule();
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    'pointerup',
    () => {
      if (!drag) return;
      // Clicking a line without moving it shouldn't leave an empty undo step.
      if (!drag.moved && !drag.fresh) history.pop();
      drag = null;
      save();
      schedule();
    },
    true,
  );

  window.addEventListener('pointerout', (e) => {
    if (drawing && !e.relatedTarget && !drag) {
      mouse = hover = null;
      schedule();
    }
  });

  const deleteFromEvent = (e) => {
    if (!drawing || e.target.closest('.hud')) return;
    e.preventDefault();
    const lineEl = e.target.closest('.line');
    if (lineEl) removeLine(Number(lineEl.dataset.id));
  };
  shadow.addEventListener('contextmenu', deleteFromEvent);
  shadow.addEventListener('dblclick', deleteFromEvent);

  shadow.addEventListener('click', (e) => {
    const action = e.target.closest('[data-act]')?.dataset.act;
    if (action === 'undo') undo();
    else if (action === 'clear') clearLines();
    else if (action === 'done') setDrawing(false);
  });

  // Alt + wheel walks up / down the DOM to pick a bigger or smaller element box.
  shadow.addEventListener(
    'wheel',
    (e) => {
      if (!drawing || !e.altKey || !pickBase) return;
      e.preventDefault();
      wheelAcc += e.deltaY;
      if (Math.abs(wheelAcc) < WHEEL_STEP) return;
      const step = wheelAcc < 0 ? 1 : -1;
      wheelAcc = 0;
      pickDepth = Math.min(Math.max(pickDepth + step, 0), maxDepth(pickBase));
      track();
      schedule();
    },
    { passive: false },
  );

  // Keep page handlers from reacting to clicks meant for the overlay.
  for (const type of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'contextmenu']) {
    shadow.addEventListener(type, (e) => {
      if (drawing) e.stopPropagation();
    });
  }

  function onModifier(e) {
    if (!drawing || !mouse || (e.key !== 'Shift' && e.key !== 'Alt')) return false;
    mouse.shift = e.shiftKey;
    mouse.alt = e.altKey;
    track();
    schedule();
    return true;
  }

  window.addEventListener(
    'keydown',
    (e) => {
      if (!drawing || onModifier(e)) return;
      const key = e.key.toLowerCase();
      const plain = !e.metaKey && !e.ctrlKey;
      let handled = true;
      if (key === 'escape') setDrawing(false);
      else if (key === 'z') undo();
      else if (key === 'c' && plain) clearLines();
      else if (key === 'g' && plain) saveSettings({ columns: !settings.columns });
      else if (key === 'h' && plain) setVisible(false);
      else if ((key === 'backspace' || key === 'delete') && selectedId) removeLine(selectedId);
      else if (key.startsWith('arrow')) handled = nudge(key, e.shiftKey ? 10 : 1);
      else handled = false;
      if (handled) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
    },
    true,
  );
  window.addEventListener('keyup', onModifier, true);

  window.addEventListener(
    'scroll',
    () => {
      if (!visible) return;
      if (drawing) track();
      schedule();
    },
    { passive: true },
  );
  window.addEventListener('resize', schedule);

  // ---------------------------------------------------------------- storage & messaging

  const pageKey = () => `lines:${location.origin}${location.pathname}`;

  function save() {
    const key = pageKey();
    if (lines.length) {
      chrome.storage.local.set({ [key]: lines.map(({ axis, pos }) => ({ axis, pos })) });
    } else {
      chrome.storage.local.remove(key);
    }
  }

  function saveSettings(patch) {
    chrome.storage.local.set({ settings: { ...settings, ...patch } });
  }

  function applySettings() {
    host.style.setProperty('--c', settings.color);
    schedule();
  }

  const ready = chrome.storage.local.get(['settings', pageKey()]).then((data) => {
    settings = { ...DEFAULTS, ...data.settings };
    const saved = data[pageKey()] || [];
    if (!lines.length) lines = saved.map(({ axis, pos }) => ({ id: nextId++, axis, pos }));
    applySettings();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = { ...DEFAULTS, ...changes.settings.newValue };
      applySettings();
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    ready.then(() => {
      switch (msg.type) {
        case 'toggle':
          if (visible) setVisible(false);
          else setDrawing(true);
          break;
        case 'toggleDraw':
          setDrawing(!drawing);
          break;
        case 'setVisible':
          setVisible(msg.value);
          break;
        case 'setDrawing':
          setDrawing(msg.value);
          break;
        case 'clear':
          clearLines();
          break;
        case 'undo':
          undo();
          break;
      }
      reply({ visible, drawing, count: lines.length });
    });
    return true;
  });

  document.documentElement.append(host);
})();
