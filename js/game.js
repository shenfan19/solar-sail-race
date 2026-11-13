// Browser front end: input, drawing, replay codes, local best times. All physics lives in sim.js,
// all control mapping lives in controls.js.
(function () {
  'use strict';
  const Sim = window.SailSim, Levels = window.SailLevels, Controls = window.SailControls, Solutions = window.SailSolutions || {};
  const $ = (id) => document.getElementById(id);
  const canvas = $('view'), ctx = canvas.getContext('2d');

  let level, schemeId = Controls.order[0], scheme, state, keys, warp = 5, paused = false;
  let ca = 0, cb = 0;
  let trail = [], predicted = [];
  let ghostTrail = [], ghostState = null, ghost = null, ghostCursor = null; // ghost = {level, control, keys}
  const TRAIL_EVERY = 10;

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
    trail = []; predicted = [];
    paused = false; $('pause').textContent = 'Pause';
    $('story').textContent = level.story;
    if (!keepResult) { $('result').textContent = ''; $('code').value = ''; }
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
  function panel(ox, oy, size, ax, ay, title) {
    const span = level.view.span, sc = size / (2 * span);
    const px = (p) => ox + size / 2 + p[ax] * sc;
    const py = (p) => oy + size / 2 - p[ay] * sc;
    ctx.save();
    ctx.beginPath(); ctx.rect(ox, oy, size, size); ctx.clip();
    ctx.fillStyle = '#0b1020'; ctx.fillRect(ox, oy, size, size);
    ctx.strokeStyle = '#26324f'; ctx.lineWidth = 1;
    const ring = level.light === 'central'
      ? (level.goal.minInc === undefined ? [1, level.goal.rMin] : [1]) : [level.goal.rMin, 7, level.goal.rMax];
    ring.forEach((r) => { ctx.beginPath(); ctx.arc(ox + size / 2, oy + size / 2, r * sc, 0, 6.2832); ctx.stroke(); });
    ctx.fillStyle = level.light === 'central' ? '#ffb020' : '#3a7bd5';
    ctx.beginPath();
    ctx.arc(ox + size / 2, oy + size / 2, level.light === 'central' ? 7 : level.bodyRadius * sc, 0, 6.2832);
    ctx.fill();
    if (level.light === 'external' && ay === 1) { // planet shadow in the plane view that contains the light
      const w = level.bodyRadius * sc;
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      ctx.save(); ctx.translate(ox + size / 2, oy + size / 2); ctx.rotate(Math.atan2(-state.ly, state.lx));
      ctx.fillRect(0, -w, span * 2 * sc, 2 * w); ctx.restore();
    }
    const line = (pts, color, width, dash) => {
      if (pts.length < 2) return;
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(px(pts[0]), py(pts[0]));
      for (let i = 1; i < pts.length; i++) ctx.lineTo(px(pts[i]), py(pts[i]));
      ctx.stroke(); ctx.setLineDash([]);
    };
    line(ghostTrail, '#7a8cff', 1.5);
    line(trail, '#ffaa33', 1.5);
    line(predicted, '#33cc99', 1, [4, 4]);
    const me = [state.x, state.y, state.z];
    const nrm = Sim.sailNormal(state, ca, cb, {});
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(px(me), py(me), 4, 0, 6.2832); ctx.fill();
    const nv = [nrm.x, nrm.y, nrm.z];
    ctx.strokeStyle = '#ff5566'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px(me), py(me));
    ctx.lineTo(px(me) + nv[ax] * 28, py(me) - nv[ay] * 28); ctx.stroke();
    if (ghostState) {
      const g = [ghostState.x, ghostState.y, ghostState.z];
      ctx.fillStyle = '#7a8cff'; ctx.beginPath(); ctx.arc(px(g), py(g), 3, 0, 6.2832); ctx.fill();
    }
    if (level.light === 'external' && ay === 1) { // sun direction marker
      ctx.strokeStyle = '#ffb020'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(ox + 40 - state.lx * 24, oy + 40 + state.ly * 24);
      ctx.lineTo(ox + 40 + state.lx * 24, oy + 40 - state.ly * 24); ctx.stroke();
      ctx.fillStyle = '#ffb020'; ctx.font = '11px sans-serif'; ctx.fillText('light', ox + 24, oy + 76);
    }
    ctx.fillStyle = '#8ea0c8'; ctx.font = '12px sans-serif'; ctx.fillText(title, ox + 8, oy + size - 8);
    ctx.restore();
  }

  function draw() {
    const h = canvas.height;
    ctx.clearRect(0, 0, canvas.width, h);
    panel(0, 0, h, 0, 1, 'top view (x, y), reference plane');
    panel(h, 0, h, 0, 2, 'side view (x, z)');
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

  function frame() {
    if (!paused) {
      for (let i = 0; i < warp && !state.done; i++) tickOnce();
      predict();
    }
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
  document.querySelectorAll('[data-warp]').forEach((b) => b.addEventListener('click', () => { warp = +b.dataset.warp; }));
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT')) return;
    const step = e.shiftKey ? 5 : 1;
    if (e.key === 'ArrowUp') setControl(ca + step, cb);
    else if (e.key === 'ArrowDown') setControl(ca - step, cb);
    else if (e.key === 'ArrowLeft') setControl(ca, cb - step);
    else if (e.key === 'ArrowRight') setControl(ca, cb + step);
    else if (e.key === ' ') { $('pause').click(); }
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

  startLevel(Levels[0].id);
  requestAnimationFrame(frame);
})();
