// Browser front end: input, 3D views, replay codes, local best times. All physics lives in sim.js,
// all control mapping lives in controls.js, all drawing helpers live in view3d.js.
(function () {
  'use strict';
  const Sim = window.SailSim, Levels = window.SailLevels, Controls = window.SailControls, V = window.SailView;
  const Solutions = window.SailSolutions || {};
  const $ = (id) => document.getElementById(id);
  const canvas = $('view'), ctx = canvas.getContext('2d');

  let level, schemeId = Controls.order[0], scheme, state, keys, paused = false;
  let speed = 1, tickDebt = 0, lastTime = null;
  let ca = 0, cb = 0;
  let trail = [], predicted = [];
  let ghostTrail = [], ghostState = null, ghost = null, ghostCursor = null; // ghost = {level, control, keys}
  const TRAIL_EVERY = 10;
  let layout = 'three', active = 0;
  const vps = [V.makeViewport('iso'), V.makeViewport('top'), V.makeViewport('side')];

  // ---- storage helpers (storage may be blocked, the game must work without it) ----
  function bestKey() { return 'sailBest:' + level.id + ':' + schemeId; }
  function loadBest() { try { return JSON.parse(localStorage.getItem(bestKey()) || 'null'); } catch (e) { return null; } }
  function saveBest(rec) { try { localStorage.setItem(bestKey(), JSON.stringify(rec)); } catch (e) { /* ignore */ } }

  // ---- replay codes: base64 of a small JSON, format v2 ----
  function encodeReplay() { return btoa(JSON.stringify({ v: 2, level: level.id, control: schemeId, keys: keys })); }
  function decodeReplay(text) {
    const o = JSON.parse(atob(text.trim()));
    if (o.v !== 2 || !Array.isArray(o.keys) || !Controls.registry[o.control]) throw new Error('not a replay code');
    return o;
  }

  function startLevel(id, keepResult) {
    level = Levels.find((l) => l.id === id) || Levels[0];
    scheme = Controls.registry[schemeId];
    state = Sim.createState(level, schemeId);
    ca = scheme.a.start; cb = scheme.b.start;
    keys = [{ t: 0, a: ca, b: cb }];
    trail = []; predicted = []; tickDebt = 0;
    paused = false; $('pause').textContent = 'Pause';
    $('story').textContent = level.story;
    if (!keepResult) { $('result').textContent = ''; $('code').value = ''; }
    vps.forEach((vp) => { vp.zoom = 1; });
    refreshBest();
    resetGhost();
    configureSliders();
  }

  function resetGhost() {
    ghostTrail = [];
    ghostState = ghost && ghost.level === level.id ? Sim.createState(level, ghost.control) : null;
    ghostCursor = { i: 0 };
  }

  function configureSliders() {
    $('aName').textContent = scheme.a.label; $('bName').textContent = scheme.b.label;
    const A = $('ca'), B = $('cb');
    A.min = scheme.a.min; A.max = scheme.a.max; B.min = scheme.b.min; B.max = scheme.b.max;
    $('ctrlHelp').textContent = scheme.id === 'euler'
      ? 'Pitch tilts the sail normal out of the orbit plane. Yaw tilts it along the orbit. Both are measured from the direction of the light, so 0 and 0 faces the light and pushes straight away.'
      : 'Cone is the angle between the sail normal and the light. Clock is the direction the sail leans toward around the light axis: 0 forward along the orbit, 90 toward the orbit normal.';
    syncSliders();
  }
  function syncSliders() {
    $('ca').value = ca; $('cb').value = cb;
    $('aV').textContent = ca + '°'; $('bV').textContent = cb + '°';
  }

  function setControl(a, b) {
    const c = Controls.clamp(scheme, a, b);
    if (c[0] === ca && c[1] === cb) return;
    ca = c[0]; cb = c[1];
    const last = keys[keys.length - 1];
    if (last.t === state.tick) { last.a = ca; last.b = cb; }
    else keys.push({ t: state.tick, a: ca, b: cb });
    syncSliders();
  }

  // ---- loop ----
  function tickOnce() {
    Sim.step(state, ca, cb);
    if (state.tick % TRAIL_EVERY === 0) trail.push([state.x, state.y, state.z]);
    if (ghostState && !ghostState.done) {
      const k = Sim.controlAt(ghost.keys, ghostState.tick, ghostCursor);
      Sim.step(ghostState, k.a, k.b);
      if (ghostState.tick % TRAIL_EVERY === 0) ghostTrail.push([ghostState.x, ghostState.y, ghostState.z]);
    }
    if (state.done) finish();
  }

  function finish() {
    paused = true;
    const time = state.tick * level.dt;
    const unit = level.timeScaleLabel;
    if (state.done === 'success') {
      const best = loadBest();
      let msg = 'Reached the goal in ' + time.toFixed(1) + ' ' + unit + ' with ' + keys.length + ' control changes.';
      if (!best || time < best.time) { saveBest({ time: time, keys: keys.length }); msg += ' New personal best.'; }
      $('result').textContent = msg;
      $('code').value = encodeReplay();
    } else if (state.done === 'fail') {
      $('result').textContent = 'Lost: the sail left the allowed distance range.';
    } else {
      $('result').textContent = 'Out of time.';
    }
    refreshBest();
  }

  function refreshBest() {
    const b = loadBest();
    $('best').textContent = b ? b.time.toFixed(1) + ' ' + level.timeScaleLabel + ' (' + b.keys + ' control changes)' : 'none yet';
  }

  function predict() {
    const s = Object.assign({}, state); // plain numbers, level and scheme shared and read only
    predicted = [];
    const n = level.light === 'central' ? 500 : 700;
    for (let i = 0; i < n && !s.done; i++) {
      Sim.step(s, ca, cb);
      if (i % 4 === 0) predicted.push([s.x, s.y, s.z]);
    }
  }

  // ---- drawing ----
  function orbitNormal(s) {
    const hx = s.y * s.vz - s.z * s.vy, hy = s.z * s.vx - s.x * s.vz, hz = s.x * s.vy - s.y * s.vx;
    const n = Math.hypot(hx, hy, hz) || 1;
    return [hx / n, hy / n, hz / n];
  }
  function lightDir(s) {
    if (level.light === 'external') return [s.lx, s.ly, s.lz];
    const r = Math.hypot(s.x, s.y, s.z) || 1;
    return [s.x / r, s.y / r, s.z / r];
  }

  function drawViewport(vp, index) {
    const R = vp.rect, span = level.view.span;
    const me = [state.x, state.y, state.z];
    const h = orbitNormal(state), l = lightDir(state);
    V.updateDynamic(vp, h, l);
    V.prep(vp, span, vp.follow ? me : [0, 0, 0]);

    ctx.save();
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();
    ctx.fillStyle = '#0b1020'; ctx.fillRect(R.x, R.y, R.w, R.h);

    // reference plane rings and axes
    const X = [1, 0, 0], Y = [0, 1, 0], Zv = [0, 0, 1], O = [0, 0, 0];
    const rings = level.light === 'central'
      ? (level.goal.minInc === undefined ? [1, level.goal.rMin] : [1]) : [level.goal.rMin, 7, level.goal.rMax];
    rings.forEach((r) => V.polyline(ctx, vp, V.circlePoints(O, r, X, Y, 96), '#2b3860', 1));
    const ax = span * 0.5;
    V.segment(ctx, vp, O, [ax, 0, 0], '#7a3340', 1);
    V.segment(ctx, vp, O, [0, ax, 0], '#337a45', 1);
    V.segment(ctx, vp, O, [0, 0, ax], '#33557a', 1);

    // current orbit plane, shows the tilt against the reference plane
    const rNow = Math.hypot(me[0], me[1], me[2]);
    if (rNow > 1e-9) {
      const e1 = [me[0] / rNow, me[1] / rNow, me[2] / rNow], e2 = V.cross(h, e1);
      V.polyline(ctx, vp, V.circlePoints(O, rNow, e1, e2, 96), 'rgba(80,200,230,0.55)', 1);
    }

    // central body and planet shadow
    if (level.light === 'central') V.disc(ctx, vp, O, span * 0.03, '#ffb020', 5);
    else {
      V.disc(ctx, vp, O, level.bodyRadius, '#3a7bd5', 4);
      const lz = [l[0], l[1], l[2]], p1 = Zv, p2 = V.cross(lz, Zv), len = span * 1.2, b = level.bodyRadius;
      const c0 = V.circlePoints(O, b, p1, p2, 24), c1 = V.circlePoints(V.add(O, lz, len), b, p1, p2, 24);
      V.polyline(ctx, vp, c0, 'rgba(160,160,200,0.5)', 1);
      V.polyline(ctx, vp, c1, 'rgba(160,160,200,0.25)', 1);
      for (let i = 0; i < 24; i += 6) V.segment(ctx, vp, c0[i], c1[i], 'rgba(160,160,200,0.25)', 1);
    }

    V.polyline(ctx, vp, ghostTrail, '#7a8cff', 1.5);
    V.polyline(ctx, vp, trail, '#ffaa33', 1.5);
    V.polyline(ctx, vp, predicted, '#33cc99', 1, [4, 4]);
    if (ghostState) V.disc(ctx, vp, [ghostState.x, ghostState.y, ghostState.z], span * 0.01, '#7a8cff', 3);

    // the sail: a small square facing along its normal, a red normal arrow and a yellow arrow toward the light
    const nrm = Sim.sailNormal(state, ca, cb, {}), n = [nrm.x, nrm.y, nrm.z];
    const ref = Math.abs(n[2]) < 0.9 ? Zv : X;
    const s1 = V.norm(V.cross(n, ref)), s2 = V.cross(n, s1), q = span * 0.035;
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1], [1, 1]].map((c) => V.add(V.add(me, s1, c[0] * q), s2, c[1] * q));
    V.polyline(ctx, vp, corners, '#88ccff', 2);
    V.disc(ctx, vp, me, span * 0.008, '#ffffff', 3);
    V.segment(ctx, vp, me, V.add(me, n, span * 0.12), '#ff5566', 2);
    V.segment(ctx, vp, me, V.add(me, l, -span * 0.12), '#ffd34d', 2);

    // label and active frame
    ctx.fillStyle = '#8ea0c8'; ctx.font = '13px sans-serif';
    const preset = V.PRESETS.find((p) => p.id === vp.mode);
    ctx.fillText((preset ? preset.name : 'Free') + (vp.follow ? ', follows the sail' : ''), R.x + 10, R.y + R.h - 10);
    ctx.restore();
    ctx.strokeStyle = index === active ? '#ffaa33' : '#26324f'; ctx.lineWidth = index === active ? 2 : 1;
    ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1);
  }

  function layoutViewports() {
    const rects = V.LAYOUTS[layout], W = canvas.width, H = canvas.height;
    rects.forEach((r, i) => { vps[i].rect = { x: r[0] * W, y: r[1] * H, w: r[2] * W, h: r[3] * H }; });
    if (active >= rects.length) active = 0;
  }

  function draw() {
    layoutViewports();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < V.LAYOUTS[layout].length; i++) drawViewport(vps[i], i);
    const r = Math.sqrt(state.x * state.x + state.y * state.y + state.z * state.z);
    let goalText, progress;
    if (level.goal.minInc !== undefined) {
      const inc = Sim.inclinationDeg(state), shown = inc > 90 ? 180 - inc : inc;
      goalText = 'inclination ' + shown.toFixed(1) + '° / goal ' + level.goal.minInc + '°';
      progress = shown / level.goal.minInc;
    } else {
      goalText = 'goal ' + level.goal.label;
      progress = (r - 1) / (level.goal.rMin - 1);
    }
    $('hud').textContent =
      'time ' + (state.tick * level.dt).toFixed(1) + ' ' + level.timeScaleLabel +
      '   distance ' + r.toFixed(3) + ' ' + level.unitLen + '   ' + goalText +
      '   control changes ' + keys.length;
    $('bar').style.width = Math.max(0, Math.min(100, progress * 100)) + '%';
  }

  // Simulation speed is in real time: level.view.rate simulated time units per second at 1x, times the speed button.
  function frame(now) {
    if (lastTime === null) lastTime = now;
    const dtReal = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    if (!paused && !state.done) {
      tickDebt += dtReal * speed * level.view.rate / level.dt;
      let n = Math.floor(tickDebt);
      tickDebt -= n;
      if (n > 4000) n = 4000;
      for (let i = 0; i < n && !state.done; i++) tickOnce();
    }
    predict();
    draw();
    requestAnimationFrame(frame);
  }

  // ---- wiring ----
  const sel = $('level'), csel = $('ctrl');
  Levels.forEach((l) => { const o = document.createElement('option'); o.value = l.id; o.textContent = l.name; sel.appendChild(o); });
  Controls.order.forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = Controls.registry[id].name; csel.appendChild(o); });
  sel.addEventListener('change', () => startLevel(sel.value));
  csel.addEventListener('change', () => { schemeId = csel.value; startLevel(level.id); });
  $('restart').addEventListener('click', () => startLevel(level.id));
  $('pause').addEventListener('click', () => { if (!state.done) paused = !paused; $('pause').textContent = paused ? 'Resume' : 'Pause'; });
  $('ca').addEventListener('input', (e) => setControl(+e.target.value, cb));
  $('cb').addEventListener('input', (e) => setControl(ca, +e.target.value));

  function setSpeed(s) {
    speed = s;
    document.querySelectorAll('[data-speed]').forEach((b) => b.classList.toggle('on', +b.dataset.speed === s));
  }
  document.querySelectorAll('[data-speed]').forEach((b) => b.addEventListener('click', () => setSpeed(+b.dataset.speed)));
  setSpeed(1);

  function setLayout(name) {
    layout = name;
    document.querySelectorAll('[data-layout]').forEach((b) => b.classList.toggle('on', b.dataset.layout === name));
  }
  document.querySelectorAll('[data-layout]').forEach((b) => b.addEventListener('click', () => setLayout(b.dataset.layout)));
  setLayout('three');

  const presetBox = $('presets');
  V.PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.textContent = p.name + ' (' + p.key + ')'; b.dataset.preset = p.id;
    b.addEventListener('click', () => V.applyPreset(vps[active], p.id));
    presetBox.appendChild(b);
  });
  $('follow').addEventListener('click', () => { vps[active].follow = !vps[active].follow; });

  // mouse: click selects a viewport, drag rotates it, wheel zooms it
  function viewportAt(e) {
    const b = canvas.getBoundingClientRect(), k = canvas.width / b.width;
    const x = (e.clientX - b.left) * k, y = (e.clientY - b.top) * k;
    for (let i = 0; i < V.LAYOUTS[layout].length; i++) {
      const R = vps[i].rect;
      if (x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h) return i;
    }
    return -1;
  }
  let drag = null;
  canvas.addEventListener('mousedown', (e) => {
    const i = viewportAt(e);
    if (i < 0) return;
    active = i; drag = { x: e.clientX, y: e.clientY };
  });
  window.addEventListener('mouseup', () => { drag = null; });
  window.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const vp = vps[active];
    vp.mode = 'free';
    vp.az -= (e.clientX - drag.x) * 0.5;
    vp.el = Math.max(-90, Math.min(90, vp.el + (e.clientY - drag.y) * 0.5));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  canvas.addEventListener('wheel', (e) => {
    const i = viewportAt(e);
    if (i < 0) return;
    e.preventDefault();
    vps[i].zoom = Math.max(0.15, Math.min(40, vps[i].zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  }, { passive: false });

  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const step = e.shiftKey ? 5 : 1;
    const pre = V.PRESETS.find((p) => p.key === e.key);
    if (e.key === 'ArrowUp') setControl(ca + step, cb);
    else if (e.key === 'ArrowDown') setControl(ca - step, cb);
    else if (e.key === 'ArrowLeft') setControl(ca, cb - step);
    else if (e.key === 'ArrowRight') setControl(ca, cb + step);
    else if (e.key === ' ') { $('pause').click(); }
    else if (pre) V.applyPreset(vps[active], pre.id);
    else if (e.key === 'v' || e.key === 'V') { const o = ['one', 'two', 'three']; setLayout(o[(o.indexOf(layout) + 1) % 3]); }
    else if (e.key === 'f' || e.key === 'F') $('follow').click();
    else if (e.key === '[') setSpeed(Math.max(0.25, speed / 4));
    else if (e.key === ']') setSpeed(Math.min(64, speed * 4));
    else return;
    e.preventDefault();
  });

  function loadGhost(o) {
    ghost = o;
    if (o.level !== level.id) sel.value = o.level;
    startLevel(o.level, true);
    const lv = Levels.find((l) => l.id === o.level);
    const check = Sim.runReplay(lv, o.keys, o.control); // verified by re-simulation, a code is never trusted
    $('result').textContent = 'Ghost loaded (' + Controls.registry[o.control].name + '): ' + check.status + ' after ' +
      check.time.toFixed(1) + ' ' + lv.timeScaleLabel + ', ' + check.keys + ' control changes.';
  }
  $('ghostLoad').addEventListener('click', () => {
    try { loadGhost(decodeReplay($('code').value)); } catch (e) { $('result').textContent = 'That is not a valid replay code.'; }
  });
  $('ghostRef').addEventListener('click', () => {
    const s = (Solutions[level.id] || {})[schemeId];
    if (!s) { $('result').textContent = 'No reference solution for this level and control.'; return; }
    loadGhost({ v: 2, level: level.id, control: schemeId, keys: s.keys });
  });
  $('ghostClear').addEventListener('click', () => { ghost = null; startLevel(level.id); });
  $('copy').addEventListener('click', () => { $('code').select(); try { document.execCommand('copy'); } catch (e) { /* ignore */ } });

  // optional deep link, for example index.html#level=earth-polar&control=cone-clock&layout=one
  const hash = {};
  location.hash.replace(/^#/, '').split('&').forEach((kv) => { const p = kv.split('='); if (p[0]) hash[p[0]] = p[1]; });
  if (hash.control && Controls.registry[hash.control]) { schemeId = hash.control; csel.value = schemeId; }
  if (hash.layout && V.LAYOUTS[hash.layout]) setLayout(hash.layout);
  const first = Levels.find((l) => l.id === hash.level) || Levels[0];
  sel.value = first.id;
  startLevel(first.id);
  requestAnimationFrame(frame);
})();
