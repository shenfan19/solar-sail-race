// Game front end: screens (menu, briefing, play, pause, results), input (pad, keyboard, mouse, gamepad), 3D drawing.
// All physics lives in sim.js, control mapping in controls.js, guidance in guide.js, drawing helpers in view3d.js.
(function () {
  'use strict';
  const Sim = window.SailSim, Levels = window.SailLevels, Controls = window.SailControls, Guide = window.SailGuide, V = window.SailView;
  const Solutions = window.SailSolutions || {};
  const $ = (id) => document.getElementById(id);

  // interface settings, none of these touch the physics
  const CFG = {
    padCone: 80,        // cone angle at the edge of the tilt pad, degrees
    padStep: 0.04,      // the pad is quantized to this step so a run has a manageable number of keyframes
    padSpeed: 0.9,      // pad units per second at full stick or key
    deadzone: 0.18,
    speeds: [0.25, 1, 4, 16, 64],
    attractTicks: 30,   // ticks per frame for the background demo flight
    cameraSpin: 0.12,   // degrees per frame for the idle camera
    autoSpeedIndex: 4
  };

  const canvas = $('view'), ctx = canvas.getContext('2d');
  const padCanvas = $('pad'), pctx = padCanvas.getContext('2d');
  let W = 0, H = 0;

  // ---- settings and records (storage may be blocked, everything works without it) ----
  const settings = { scheme: Controls.order[0], guide: true };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  (function loadSettings() {
    const s = lsGet('sailSettings');
    if (s) { try { const o = JSON.parse(s); if (Controls.registry[o.scheme]) settings.scheme = o.scheme; if (typeof o.guide === 'boolean') settings.guide = o.guide; } catch (e) { /* ignore */ } }
  })();
  function saveSettings() { lsSet('sailSettings', JSON.stringify(settings)); }
  function bestKey(levelId) { return 'sailBest:' + levelId + ':' + settings.scheme; }
  function loadBest(levelId) { try { return JSON.parse(lsGet(bestKey(levelId)) || 'null'); } catch (e) { return null; } }

  function starsFor(level, time) {
    const m = level.medals;
    return time <= m.gold ? 3 : time <= m.silver ? 2 : time <= m.bronze ? 1 : 0;
  }
  function starString(n) { let s = ''; for (let i = 0; i < 3; i++) s += i < n ? '<b>★</b>' : '★'; return s; }

  // ---- state ----
  let screen = 'menu', levelIdx = 0, level = Levels[0];
  let S = null;          // the run in progress or just finished
  let att = null;        // background demo flight
  let briefGuide = settings.guide, ghostPick = { mode: 'off' }, pastedReplay = null;
  let layout = 'one', active = 0;
  const vps = [V.makeViewport('iso'), V.makeViewport('top'), V.makeViewport('side')];
  let lastDevice = 'keyboard', gamepadName = null;
  const held = {};
  const hashArgs = {};
  location.hash.replace(/^#/, '').split('&').forEach((kv) => { const p = kv.split('='); if (p[0]) hashArgs[p[0]] = p[1]; });

  // ---- replay codes: base64 of a small JSON, format v2 ----
  function encodeReplay(run) {
    return btoa(JSON.stringify({ v: 2, level: run.level.id, control: run.schemeId, assist: run.assisted, keys: run.keys }));
  }
  function decodeReplay(text) {
    const o = JSON.parse(atob(text.trim()));
    if (o.v !== 2 || !Array.isArray(o.keys) || !Controls.registry[o.control] || !Levels.find((l) => l.id === o.level)) throw new Error('bad code');
    return o;
  }

  // ---- screens ----
  const OVERLAYS = { menu: ['menu'], brief: ['brief'], play: ['hud'], pause: ['hud', 'pause'], result: ['result'], settings: ['menu', 'settings'], help: ['menu', 'help'] };
  const TOP = { menu: 'menu', brief: 'brief', play: 'hud', pause: 'pause', result: 'result', settings: 'settings', help: 'help' };
  function setScreen(name) {
    screen = name;
    ['menu', 'brief', 'hud', 'pause', 'result', 'settings', 'help'].forEach((id) => $(id).classList.add('hidden'));
    OVERLAYS[name].forEach((id) => $(id).classList.remove('hidden'));
    canvas.style.cursor = name === 'play' || name === 'result' ? 'grab' : 'default';
    if (name !== 'play') { const first = focusables()[0]; if (first) first.focus(); }
    if (name === 'menu') refreshMenu();
  }
  function focusables() {
    const root = $(TOP[screen]);
    return Array.prototype.filter.call(root.querySelectorAll('button, select'), (e) => e.offsetParent !== null && !e.disabled);
  }
  function moveFocus(dir) {
    const list = focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    list[(i + dir + list.length) % list.length].focus();
  }
  function goBack() {
    if (screen === 'brief' || screen === 'settings' || screen === 'help' || screen === 'result') setScreen('menu');
    else if (screen === 'pause') resume();
    else if (screen === 'play') pause();
  }

  // ---- menu ----
  function buildMenu() {
    const box = $('levels');
    box.innerHTML = '';
    Levels.forEach((lv, i) => {
      const b = document.createElement('button');
      b.className = 'card'; b.dataset.index = i;
      b.addEventListener('click', () => openBrief(i));
      b.addEventListener('focus', () => { if (screen === 'menu') attractFor(Levels[i]); });
      b.addEventListener('mouseenter', () => { if (screen === 'menu') attractFor(Levels[i]); });
      box.appendChild(b);
    });
  }
  function refreshMenu() {
    Array.prototype.forEach.call($('levels').children, (b, i) => {
      const lv = Levels[i], best = loadBest(lv.id);
      b.innerHTML = '<div class="num">MISSION ' + (i + 1) + '</div><div class="name">' + lv.name + '</div>' +
        '<div class="goal">' + lv.brief.goal + '</div>' +
        '<div class="row"><span class="tag ' + lv.difficulty + '">' + lv.difficulty + '</span>' +
        '<span class="stars">' + starString(best ? best.stars : 0) + '</span></div>' +
        '<div class="row" style="margin-top:6px;color:var(--muted)">' + (best ? 'Best ' + best.time.toFixed(1) + ' ' + lv.timeScaleLabel : 'Not flown yet') + '</div>';
    });
    $('pads').textContent = gamepadName ? 'Gamepad connected. D-pad or stick to move, A to select.' : 'Keyboard, mouse or a gamepad all work.';
  }

  // ---- briefing ----
  function openBrief(i) {
    levelIdx = i; level = Levels[i];
    attractFor(level);
    briefGuide = settings.guide;
    ghostPick = { mode: 'off' };
    $('briefNum').textContent = 'MISSION ' + (i + 1) + '  ·  ' + level.difficulty.toUpperCase();
    $('briefName').textContent = level.name;
    $('briefGoal').textContent = level.brief.goal;
    $('briefSteps').innerHTML = level.brief.steps.map((t) => '<li>' + t + '</li>').join('');
    refreshBriefButtons();
    setScreen('brief');
    $('btnLaunch').focus();
  }
  function ghostOptions() {
    const opts = [{ mode: 'off', label: 'Off' }];
    const ref = (Solutions[level.id] || {})[settings.scheme];
    if (ref) opts.push({ mode: 'ref', label: 'Reference pilot', keys: ref.keys, control: settings.scheme });
    const best = loadBest(level.id);
    if (best && best.code) { try { const d = decodeReplay(best.code); opts.push({ mode: 'best', label: 'My best', keys: d.keys, control: d.control }); } catch (e) { /* ignore */ } }
    if (pastedReplay && pastedReplay.level === level.id) opts.push({ mode: 'code', label: 'Pasted replay', keys: pastedReplay.keys, control: pastedReplay.control });
    return opts;
  }
  function refreshBriefButtons() {
    $('btnBriefGuide').textContent = briefGuide ? 'On' : 'Off';
    $('btnBriefGuide').classList.toggle('on', briefGuide);
    const sel = ghostOptions().find((o) => o.mode === ghostPick.mode) || { label: 'Off' };
    $('btnBriefGhost').textContent = sel.label;
  }

  // ---- background demo flight: the reference solution flying forever behind the menus ----
  function attractFor(lv) {
    if (att && att.level === lv) return;
    const ref = (Solutions[lv.id] || {}).euler;
    att = { level: lv, schemeId: 'euler', state: Sim.createState(lv, 'euler'), keys: ref ? ref.keys : [{ t: 0, a: 0, b: 0 }], cursor: { i: 0 }, trail: [], a: 0, b: 0, wait: 0, predicted: [], ghostState: null, ghostTrail: [] };
  }
  function stepAttract() {
    if (!att) return;
    if (att.state.done) {
      if (++att.wait > 90) { const lv = att.level; att = null; attractFor(lv); }
      return;
    }
    for (let i = 0; i < CFG.attractTicks && !att.state.done; i++) {
      const k = Sim.controlAt(att.keys, att.state.tick, att.cursor);
      att.a = k.a; att.b = k.b;
      Sim.step(att.state, k.a, k.b);
      if (att.state.tick % 10 === 0) att.trail.push([att.state.x, att.state.y, att.state.z]);
    }
  }

  // ---- a run ----
  function startRun() {
    const scheme = Controls.registry[settings.scheme];
    const state = Sim.createState(level, settings.scheme);
    S = {
      level: level, schemeId: settings.scheme, scheme: scheme, state: state,
      a: scheme.a.start, b: scheme.b.start, keys: [{ t: 0, a: scheme.a.start, b: scheme.b.start }],
      trail: [], predicted: [], tickDebt: 0, speedIdx: 1, paused: false, touched: false,
      guide: briefGuide, assisted: briefGuide, padX: 0, padY: 0,
      rMin: Infinity, rMax: 0, ghostState: null, ghostTrail: [], ghostCursor: { i: 0 }, ghost: null, autoplay: null
    };
    const opt = ghostOptions().find((o) => o.mode === ghostPick.mode);
    if (opt && opt.keys) { S.ghost = opt; S.ghostState = Sim.createState(level, opt.control); }
    if (hashArgs.autoplay) {
      const ref = (Solutions[level.id] || {})[settings.scheme];
      if (ref) { S.autoplay = { keys: ref.keys, cursor: { i: 0 } }; S.speedIdx = CFG.autoSpeedIndex; }
    }
    vps.forEach((vp) => { vp.zoom = 1; });
    V.applyPreset(vps[0], 'iso');
    $('lvlName').textContent = level.name;
    $('padBox').classList.add('nudge');
    refreshHudButtons();
    setScreen('play');
  }

  function setControl(a, b) {
    const c = Controls.clamp(S.scheme, a, b);
    c[0] += 0; c[1] += 0; // turn -0 into 0
    if (c[0] === S.a && c[1] === S.b) return false;
    S.a = c[0]; S.b = c[1];
    const last = S.keys[S.keys.length - 1];
    if (last.t === S.state.tick) { last.a = S.a; last.b = S.b; } else S.keys.push({ t: S.state.tick, a: S.a, b: S.b });
    return true;
  }
  function applyPad() {
    const q = CFG.padStep;
    const qx = Math.round(S.padX / q) * q, qy = Math.round(S.padY / q) * q;
    const n = Guide.padToLocal(qx, qy, CFG.padCone);
    const ab = S.scheme.fromLocal(n[0], n[1], n[2]);
    if (setControl(ab[0], ab[1]) && !S.autoplay) S.touched = true;
  }
  function movePad(dx, dy) {
    S.padX += dx; S.padY += dy;
    const m = Math.hypot(S.padX, S.padY);
    if (m > 1) { S.padX /= m; S.padY /= m; }
  }

  function tickOnce() {
    if (S.autoplay) { const k = Sim.controlAt(S.autoplay.keys, S.state.tick, S.autoplay.cursor); setControl(k.a, k.b); }
    Sim.step(S.state, S.a, S.b);
    const st = S.state;
    if (st.tick % 10 === 0) {
      S.trail.push([st.x, st.y, st.z]);
      const r = Math.sqrt(st.x * st.x + st.y * st.y + st.z * st.z);
      if (r < S.rMin) S.rMin = r; if (r > S.rMax) S.rMax = r;
    }
    if (S.ghostState && !S.ghostState.done) {
      const k = Sim.controlAt(S.ghost.keys, S.ghostState.tick, S.ghostCursor);
      Sim.step(S.ghostState, k.a, k.b);
      if (S.ghostState.tick % 10 === 0) S.ghostTrail.push([S.ghostState.x, S.ghostState.y, S.ghostState.z]);
    }
    if (st.done) finishRun();
  }

  function predict() {
    const s = Object.assign({}, S.state);
    S.predicted = [];
    const n = level.light === 'central' ? 500 : 700;
    for (let i = 0; i < n && !s.done; i++) {
      Sim.step(s, S.a, S.b);
      if (i % 4 === 0) S.predicted.push([s.x, s.y, s.z]);
    }
  }

  function pause() { if (screen === 'play') { S.paused = true; setScreen('pause'); $('btnResume').focus(); } }
  function resume() { if (screen === 'pause') { S.paused = false; setScreen('play'); } }
  function restart() { startRun(); }

  // ---- results ----
  function finishRun() {
    const st = S.state, lv = S.level, time = st.tick * lv.dt, ok = st.done === 'success';
    const stars = ok ? starsFor(lv, time) : 0;
    const best = loadBest(lv.id);
    let record = false;
    if (ok && (!best || time < best.time)) {
      record = true;
      lsSet(bestKey(lv.id), JSON.stringify({ time: time, keys: S.keys.length, stars: stars, assisted: S.assisted, code: encodeReplay(S) }));
    }
    const m = lv.medals, unit = lv.timeScaleLabel;
    $('resultTitle').textContent = ok ? 'MISSION COMPLETE' : st.done === 'fail' ? 'SAIL LOST' : 'OUT OF TIME';
    $('resultTitle').className = ok ? 'ok' : 'bad';
    $('medals').innerHTML = ok ? starString(stars) : '';
    $('resultTime').textContent = time.toFixed(1);
    $('resultUnit').textContent = unit;
    $('resultBanner').innerHTML = record ? '<span class="banner">NEW RECORD</span>' : '';
    let msg;
    if (!ok) msg = st.done === 'fail' ? 'The sail drifted out of the safe range. Try a gentler lean and watch the green guide.' : 'The clock ran out before the goal.';
    else if (stars === 3) msg = 'Gold pace. Hard to beat.';
    else if (stars === 2) msg = 'Silver. Gold needs ' + m.gold + ' ' + unit + ' or less.';
    else if (stars === 1) msg = 'Bronze. Silver needs ' + m.silver + ' ' + unit + ' or less.';
    else msg = 'Goal reached. Bronze needs ' + m.bronze + ' ' + unit + ' or less.';
    $('resultMsg').textContent = msg;
    const stat = (k, v) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
    $('resultStats').innerHTML =
      stat('Adjustments', S.keys.length) +
      stat('Closest', S.rMin === Infinity ? '-' : S.rMin.toFixed(2) + ' ' + lv.unitLen) +
      stat('Farthest', S.rMax.toFixed(2) + ' ' + lv.unitLen) +
      stat('Guide', S.assisted ? 'Used' : 'None');
    $('btnNext').classList.toggle('hidden', !(ok && levelIdx + 1 < Levels.length));
    $('btnCopy').classList.toggle('hidden', !ok);
    vps[0].mode = 'free';
    setScreen('result');
    const first = ok && levelIdx + 1 < Levels.length ? $('btnNext') : $('btnRetry');
    first.focus();
  }

  // ---- HUD ----
  function progressNow() {
    const st = S.state, lv = S.level;
    if (lv.goal.minInc !== undefined) {
      const inc = Sim.inclinationDeg(st), shown = inc > 90 ? 180 - inc : inc;
      return { p: shown / lv.goal.minInc, text: 'Orbit tilt', val: shown.toFixed(0) + '° / ' + lv.goal.minInc + '°' };
    }
    const r = Math.sqrt(st.x * st.x + st.y * st.y + st.z * st.z);
    return { p: (r - 1) / (lv.goal.rMin - 1), text: 'Distance from the Sun', val: r.toFixed(2) + ' / ' + lv.goal.rMin + ' ' + lv.unitLen };
  }
  function coachText(p) {
    const h = S.level.hints;
    if (!S.touched && !S.autoplay) return h.first;
    let t = '';
    h.steps.forEach((s) => { if (p >= s.p) t = s.text; });
    return t;
  }
  function updateHud() {
    const st = S.state, lv = S.level, pr = progressNow();
    $('timer').innerHTML = (st.tick * lv.dt).toFixed(1) + '<small>' + lv.timeScaleLabel + '</small>';
    $('goalText').textContent = pr.text; $('goalVal').textContent = pr.val;
    $('goalBar').firstElementChild.style.width = Math.max(0, Math.min(100, pr.p * 100)) + '%';
    $('coach').textContent = coachText(pr.p);
    $('padBox').classList.toggle('nudge', !S.touched && !S.autoplay);
    $('angles').textContent = S.scheme.a.label + ' ' + S.a + '°   ' + S.scheme.b.label + ' ' + S.b + '°';
    $('speedLabel').textContent = CFG.speeds[S.speedIdx] + 'x';
    $('btnPause').textContent = S.paused ? 'Resume' : 'Pause';
    $('keyhints').innerHTML = lastDevice === 'pad'
      ? '<kbd>L stick</kbd>tilt<kbd>R stick</kbd>camera<kbd>A</kbd>pause<kbd>X</kbd>view<kbd>Y</kbd>guide<kbd>LB RB</kbd>speed'
      : '<kbd>Arrows</kbd>tilt<kbd>Space</kbd>pause<kbd>G</kbd>guide<kbd>1 to 5</kbd>views<kbd>[ ]</kbd>speed<kbd>R</kbd>restart';
  }
  function refreshHudButtons() {
    $('btnGuide').classList.toggle('on', S.guide);
    $('btnSplit').classList.toggle('on', layout !== 'one');
    $('btnFollow').classList.toggle('on', vps[active].follow);
    Array.prototype.forEach.call($('presets').children, (b) => b.classList.toggle('on', vps[active].mode === b.dataset.preset));
  }

  // ---- tilt pad drawing ----
  function drawPad() {
    const w = padCanvas.width, c = w / 2, R = c - 14;
    pctx.clearRect(0, 0, w, w);
    pctx.strokeStyle = 'rgba(147,163,212,0.35)'; pctx.lineWidth = 2;
    pctx.beginPath(); pctx.arc(c, c, R, 0, 6.2832); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(c - R, c); pctx.lineTo(c + R, c); pctx.moveTo(c, c - R); pctx.lineTo(c, c + R); pctx.stroke();
    pctx.fillStyle = 'rgba(147,163,212,0.8)'; pctx.font = '600 22px sans-serif'; pctx.textAlign = 'center';
    pctx.fillText('forward', c + R - 40, c - 8); pctx.fillText('pole', c + 26, c - R + 26);
    let gp = null;
    if (S.guide) {
      const wn = Guide.wanted(S.state, S.level.autopilot);
      gp = Guide.localToPad(wn[0], wn[1], CFG.padCone);
      pctx.strokeStyle = 'rgba(76,255,154,0.35)'; pctx.setLineDash([6, 6]);
      pctx.beginPath(); pctx.arc(c, c, Math.hypot(gp[0], gp[1]) * R, 0, 6.2832); pctx.stroke(); pctx.setLineDash([]);
      const pulse = 1 + 0.25 * Math.sin(performance.now() / 180);
      pctx.fillStyle = '#4cff9a'; pctx.shadowColor = '#4cff9a'; pctx.shadowBlur = 18;
      pctx.beginPath(); pctx.arc(c + gp[0] * R, c - gp[1] * R, 14 * pulse, 0, 6.2832); pctx.fill(); pctx.shadowBlur = 0;
    }
    const q = CFG.padStep, px = Math.round(S.padX / q) * q, py = Math.round(S.padY / q) * q;
    if (gp) { pctx.strokeStyle = 'rgba(255,255,255,0.35)'; pctx.lineWidth = 2; pctx.beginPath(); pctx.moveTo(c + px * R, c - py * R); pctx.lineTo(c + gp[0] * R, c - gp[1] * R); pctx.stroke(); }
    pctx.fillStyle = '#ffffff'; pctx.shadowColor = '#3ee0ff'; pctx.shadowBlur = 14;
    pctx.beginPath(); pctx.arc(c + px * R, c - py * R, 12, 0, 6.2832); pctx.fill(); pctx.shadowBlur = 0;
  }
  function padFromPointer(e) {
    const b = padCanvas.getBoundingClientRect();
    const x = ((e.clientX - b.left) / b.width) * 2 - 1, y = -(((e.clientY - b.top) / b.height) * 2 - 1);
    const k = padCanvas.width / 2, R = k - 14, s = k / R;
    S.padX = x * s; S.padY = y * s;
    const m = Math.hypot(S.padX, S.padY);
    if (m > 1) { S.padX /= m; S.padY /= m; }
  }
  let padDrag = false;
  padCanvas.addEventListener('pointerdown', (e) => { if (!S) return; padDrag = true; padCanvas.setPointerCapture(e.pointerId); padFromPointer(e); lastDevice = 'keyboard'; });
  padCanvas.addEventListener('pointermove', (e) => { if (padDrag && S) padFromPointer(e); });
  padCanvas.addEventListener('pointerup', () => { padDrag = false; });

  // ---- 3D drawing ----
  const stars = [];
  (function () { let s = 12345; for (let i = 0; i < 160; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; const x = s / 0x7fffffff; s = (s * 1103515245 + 12345) & 0x7fffffff; const y = s / 0x7fffffff; s = (s * 1103515245 + 12345) & 0x7fffffff; stars.push([x, y, 0.4 + (s / 0x7fffffff) * 1.2]); } })();

  function fillPoly(vp, pts, fill) {
    const q = pts.map((p) => V.project(vp, p));
    if (q.some((v) => !v)) return;
    ctx.fillStyle = fill; ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
    for (let i = 1; i < q.length; i++) ctx.lineTo(q[i][0], q[i][1]);
    ctx.closePath(); ctx.fill();
  }

  function drawViewport(vp, idx, sc, opts) {
    const R = vp.rect, lv = sc.level, st = sc.state, span = lv.view.span;
    const me = [st.x, st.y, st.z], h = Guide.orbitNormal(st);
    let l;
    if (lv.light === 'external') l = [st.lx, st.ly, st.lz];
    else { const r = Math.hypot(st.x, st.y, st.z) || 1; l = [st.x / r, st.y / r, st.z / r]; }
    V.updateDynamic(vp, h, l);
    V.prep(vp, span, vp.follow ? me : [0, 0, 0]);
    ctx.save();
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

    const X = [1, 0, 0], Y = [0, 1, 0], Zv = [0, 0, 1], O = [0, 0, 0];
    const rings = lv.light === 'central' ? (lv.goal.minInc === undefined ? [1, lv.goal.rMin] : [1]) : [lv.goal.rMin, 7, lv.goal.rMax];
    rings.forEach((r, i) => V.polyline(ctx, vp, V.circlePoints(O, r, X, Y, 96), (lv.goal.minInc === undefined && i === 1) ? 'rgba(255,79,163,0.8)' : '#2f4086', (lv.goal.minInc === undefined && i === 1) ? 2.5 : 1));
    const ax = span * 0.5;
    V.segment(ctx, vp, O, [ax, 0, 0], '#7a3340', 1); V.segment(ctx, vp, O, [0, ax, 0], '#337a45', 1); V.segment(ctx, vp, O, [0, 0, ax], '#33557a', 1);

    const rNow = Math.hypot(me[0], me[1], me[2]);
    if (rNow > 1e-9) {
      const e1 = [me[0] / rNow, me[1] / rNow, me[2] / rNow], e2 = V.cross(h, e1);
      V.polyline(ctx, vp, V.circlePoints(O, rNow, e1, e2, 96), 'rgba(62,224,255,0.55)', 1.5);
      if (opts.guide && lv.autopilot.law === 'incline') {
        const nd = Guide.nodeDirection(st), k = rNow * 1.2;
        V.segment(ctx, vp, [-nd[0] * k, -nd[1] * k, 0], [nd[0] * k, nd[1] * k, 0], '#ff4fa3', 2.5);
      }
    }

    // central body
    const c0 = V.project(vp, O);
    if (lv.light === 'central') {
      if (c0) {
        const g = ctx.createRadialGradient(c0[0], c0[1], 2, c0[0], c0[1], 60 * c0[2]);
        g.addColorStop(0, 'rgba(255,200,80,0.9)'); g.addColorStop(1, 'rgba(255,140,40,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c0[0], c0[1], 60 * c0[2], 0, 6.2832); ctx.fill();
      }
      V.disc(ctx, vp, O, span * 0.03, '#ffd060', 6);
    } else {
      V.disc(ctx, vp, O, lv.bodyRadius, '#3a7bd5', 5);
      const p2 = V.cross(l, Zv), len = span * 1.2, b = lv.bodyRadius;
      const a0 = V.circlePoints(O, b, Zv, p2, 24), a1 = V.circlePoints(V.add(O, l, len), b, Zv, p2, 24);
      V.polyline(ctx, vp, a0, 'rgba(160,160,200,0.5)', 1); V.polyline(ctx, vp, a1, 'rgba(160,160,200,0.25)', 1);
      for (let i = 0; i < 24; i += 6) V.segment(ctx, vp, a0[i], a1[i], 'rgba(160,160,200,0.25)', 1);
    }

    V.polyline(ctx, vp, sc.ghostTrail || [], '#8a9bff', 2);
    V.polyline(ctx, vp, sc.trail, '#ffaa33', 2.5);
    if (opts.predict) V.polyline(ctx, vp, sc.predicted, 'rgba(76,255,154,0.8)', 1.5, [5, 5]);
    if (sc.ghostState) V.disc(ctx, vp, [sc.ghostState.x, sc.ghostState.y, sc.ghostState.z], span * 0.012, '#8a9bff', 4);

    // the sail
    const nrm = Sim.sailNormal(st, sc.a, sc.b, {}), n = [nrm.x, nrm.y, nrm.z];
    const ref = Math.abs(n[2]) < 0.9 ? Zv : X, s1 = V.norm(V.cross(n, ref)), s2 = V.cross(n, s1), q = span * 0.045;
    const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map((c) => V.add(V.add(me, s1, c[0] * q), s2, c[1] * q));
    fillPoly(vp, corners, 'rgba(136,204,255,0.55)');
    V.polyline(ctx, vp, corners.concat([corners[0]]), '#bfe6ff', 2);
    V.disc(ctx, vp, me, span * 0.009, '#ffffff', 3);
    V.segment(ctx, vp, me, V.add(me, n, span * 0.13), '#ff5566', 3);
    V.segment(ctx, vp, me, V.add(me, l, -span * 0.13), '#ffd34d', 2);

    if (opts.split) {
      ctx.fillStyle = '#93a3d4'; ctx.font = '600 15px Rajdhani, sans-serif';
      const p = V.PRESETS.find((pp) => pp.id === vp.mode);
      ctx.fillText((p ? p.name : 'Free') + (vp.follow ? ', following' : ''), R.x + 12, R.y + R.h - 12);
    }
    ctx.restore();
    if (opts.split) { ctx.strokeStyle = idx === active ? '#ffb020' : '#2a3a72'; ctx.lineWidth = idx === active ? 2 : 1; ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1); }
  }

  function drawScene(sc, layoutName, opts) {
    const rects = V.LAYOUTS[layoutName];
    rects.forEach((r, i) => { vps[i].rect = { x: r[0] * W, y: r[1] * H, w: r[2] * W, h: r[3] * H }; });
    if (active >= rects.length) active = 0;
    for (let i = 0; i < rects.length; i++) drawViewport(vps[i], i, sc, Object.assign({ split: rects.length > 1 }, opts));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#9fb4ff';
    stars.forEach((s) => { ctx.globalAlpha = 0.25 + s[2] * 0.3; ctx.fillRect(s[0] * W, s[1] * H, s[2], s[2]); });
    ctx.globalAlpha = 1;
    if (screen === 'play' || screen === 'pause') {
      drawScene(S, layout, { guide: S.guide, predict: true });
    } else if (screen === 'result') {
      vps[0].az += CFG.cameraSpin; vps[0].mode = 'free';
      ctx.globalAlpha = 0.55; drawScene(S, 'one', { guide: false, predict: false }); ctx.globalAlpha = 1;
    } else if (att) {
      vps[0].az += CFG.cameraSpin; vps[0].mode = 'free';
      ctx.globalAlpha = screen === 'menu' ? 0.5 : 0.4; drawScene(att, 'one', { guide: false, predict: false }); ctx.globalAlpha = 1;
    }
  }

  // ---- main loop ----
  let lastTime = null;
  function frame(now) {
    if (lastTime === null) lastTime = now;
    const dt = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    pollGamepad(dt);
    if (screen === 'play' || screen === 'pause') {
      const kx = (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
      const ky = (held.ArrowUp || held.KeyW ? 1 : 0) - (held.ArrowDown || held.KeyS ? 1 : 0);
      if (kx || ky) movePad(kx * CFG.padSpeed * dt, ky * CFG.padSpeed * dt);
      if (!S.autoplay) applyPad();
      if (screen === 'play' && !S.state.done) {
        S.tickDebt += dt * CFG.speeds[S.speedIdx] * S.level.view.rate / S.level.dt;
        let n = Math.floor(S.tickDebt);
        S.tickDebt -= n;
        if (n > 4000) n = 4000;
        for (let i = 0; i < n && !S.state.done && screen === 'play'; i++) tickOnce();
      }
      if (screen === 'play' || screen === 'pause') { predict(); updateHud(); drawPad(); }
    } else {
      stepAttract();
    }
    draw();
    requestAnimationFrame(frame);
  }

  // ---- gamepad ----
  let prevBtn = [], navCool = 0;
  function pollGamepad(dt) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
    if (!gp) { gamepadName = null; return; }
    gamepadName = gp.id;
    const ax = (i) => { const v = gp.axes[i] || 0; return Math.abs(v) < CFG.deadzone ? 0 : v; };
    const down = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed);
    const edge = (i) => down(i) && !prevBtn[i];
    let any = false;
    for (let i = 0; i < gp.buttons.length; i++) if (down(i)) any = true;
    if (ax(0) || ax(1) || ax(2) || ax(3)) any = true;
    if (any) lastDevice = 'pad';
    const playing = screen === 'play' || screen === 'pause';
    if (playing) {
      if (ax(0) || ax(1)) movePad(ax(0) * CFG.padSpeed * dt, -ax(1) * CFG.padSpeed * dt);
      const vp = vps[active];
      if (ax(2) || ax(3)) { vp.mode = 'free'; vp.az -= ax(2) * 120 * dt; vp.el = Math.max(-90, Math.min(90, vp.el + ax(3) * 90 * dt)); }
      const zin = gp.buttons[7] ? gp.buttons[7].value : 0, zout = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (zin > 0.1 || zout > 0.1) vp.zoom = Math.max(0.15, Math.min(40, vp.zoom * Math.pow(1.8, (zin - zout) * dt)));
      if (edge(0) || edge(9)) { if (screen === 'play') pause(); else resume(); }
      if (edge(1) && screen === 'pause') resume();
      if (edge(2) || edge(15)) cyclePreset(1);
      if (edge(14)) cyclePreset(-1);
      if (edge(3)) toggleGuide();
      if (edge(4)) changeSpeed(-1);
      if (edge(5)) changeSpeed(1);
      if (edge(8)) toggleSplit();
      if (edge(10)) { S.padX = 0; S.padY = 0; }
      if (screen === 'pause') navigate(gp, dt, edge);
    } else {
      navigate(gp, dt, edge);
      if (edge(0)) { const e = document.activeElement; if (e && e.click && e.tagName !== 'BODY') e.click(); }
      if (edge(1)) goBack();
    }
    prevBtn = gp.buttons.map((b) => b.pressed);
  }
  function navigate(gp, dt, edge) {
    navCool -= dt;
    const sx = gp.axes[0] || 0, sy = gp.axes[1] || 0;
    let dir = 0;
    if (edge(12) || edge(14)) dir = -1; else if (edge(13) || edge(15)) dir = 1;
    else if (navCool <= 0 && (Math.abs(sx) > 0.6 || Math.abs(sy) > 0.6)) { dir = (sx + sy) > 0 ? 1 : -1; navCool = 0.28; }
    if (dir) moveFocus(dir);
  }

  // ---- view controls ----
  function cyclePreset(d) {
    const ids = V.PRESETS.map((p) => p.id), vp = vps[active];
    const i = Math.max(0, ids.indexOf(vp.mode));
    V.applyPreset(vp, ids[(i + d + ids.length) % ids.length]);
    refreshHudButtons();
  }
  function toggleGuide() { S.guide = !S.guide; if (S.guide) S.assisted = true; refreshHudButtons(); }
  function toggleSplit() { layout = layout === 'one' ? 'three' : 'one'; if (active >= V.LAYOUTS[layout].length) active = 0; refreshHudButtons(); }
  function changeSpeed(d) { S.speedIdx = Math.max(0, Math.min(CFG.speeds.length - 1, S.speedIdx + d)); }

  // ---- wiring ----
  buildMenu();
  V.PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'btn small'; b.textContent = p.name; b.dataset.preset = p.id; b.title = 'Key ' + p.key;
    b.addEventListener('click', () => { V.applyPreset(vps[active], p.id); refreshHudButtons(); });
    $('presets').appendChild(b);
  });
  Controls.order.forEach((id) => { const o = document.createElement('option'); o.value = id; o.textContent = Controls.registry[id].name; $('selScheme').appendChild(o); });
  $('selScheme').value = settings.scheme;
  $('btnDefGuide').textContent = settings.guide ? 'On' : 'Off';
  $('btnDefGuide').classList.toggle('on', settings.guide);

  $('btnHelp').addEventListener('click', () => setScreen('help'));
  $('btnHelpBack').addEventListener('click', () => setScreen('menu'));
  $('btnSettings').addEventListener('click', () => setScreen('settings'));
  $('btnSettingsBack').addEventListener('click', () => setScreen('menu'));
  $('selScheme').addEventListener('change', (e) => { settings.scheme = e.target.value; saveSettings(); });
  $('btnDefGuide').addEventListener('click', () => { settings.guide = !settings.guide; saveSettings(); $('btnDefGuide').textContent = settings.guide ? 'On' : 'Off'; $('btnDefGuide').classList.toggle('on', settings.guide); });
  $('btnGhostCode').addEventListener('click', () => {
    const t = window.prompt('Paste a replay code to race against it');
    if (!t) return;
    try { pastedReplay = decodeReplay(t); openBrief(Levels.findIndex((l) => l.id === pastedReplay.level)); ghostPick = { mode: 'code' }; refreshBriefButtons(); }
    catch (e) { window.alert('That is not a valid replay code.'); }
  });
  $('btnBriefBack').addEventListener('click', () => setScreen('menu'));
  $('btnBriefGuide').addEventListener('click', () => { briefGuide = !briefGuide; refreshBriefButtons(); });
  $('btnBriefGhost').addEventListener('click', () => {
    const opts = ghostOptions(), i = Math.max(0, opts.findIndex((o) => o.mode === ghostPick.mode));
    ghostPick = { mode: opts[(i + 1) % opts.length].mode };
    refreshBriefButtons();
  });
  $('btnLaunch').addEventListener('click', startRun);
  $('btnPause').addEventListener('click', () => { if (screen === 'play') pause(); else resume(); });
  $('btnResume').addEventListener('click', resume);
  $('btnRestart').addEventListener('click', restart);
  $('btnQuit').addEventListener('click', () => setScreen('menu'));
  $('btnGuide').addEventListener('click', toggleGuide);
  $('btnSplit').addEventListener('click', toggleSplit);
  $('btnFollow').addEventListener('click', () => { vps[active].follow = !vps[active].follow; refreshHudButtons(); });
  $('btnSlower').addEventListener('click', () => changeSpeed(-1));
  $('btnFaster').addEventListener('click', () => changeSpeed(1));
  $('btnNext').addEventListener('click', () => openBrief(levelIdx + 1));
  $('btnRetry').addEventListener('click', restart);
  $('btnResultMenu').addEventListener('click', () => setScreen('menu'));
  $('btnCopy').addEventListener('click', () => {
    const code = encodeReplay(S), b = $('btnCopy');
    const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy replay code'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => window.prompt('Copy this replay code', code));
    else window.prompt('Copy this replay code', code);
  });

  // camera by mouse or touch on the scene
  function viewportAt(e) {
    const b = canvas.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
    const n = V.LAYOUTS[layout].length;
    for (let i = 0; i < n; i++) { const R = vps[i].rect; if (x >= R.x && x < R.x + R.w && y >= R.y && y < R.y + R.h) return i; }
    return -1;
  }
  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (screen !== 'play' && screen !== 'pause' && screen !== 'result') return;
    const i = viewportAt(e); if (i < 0) return;
    active = i; drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); refreshHudButtonsSafe();
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const vp = vps[active];
    vp.mode = 'free'; vp.az -= (e.clientX - drag.x) * 0.5; vp.el = Math.max(-90, Math.min(90, vp.el + (e.clientY - drag.y) * 0.5));
    drag.x = e.clientX; drag.y = e.clientY;
  });
  canvas.addEventListener('pointerup', () => { drag = null; });
  canvas.addEventListener('wheel', (e) => {
    const i = Math.max(0, viewportAt(e));
    e.preventDefault();
    vps[i].zoom = Math.max(0.15, Math.min(40, vps[i].zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
  }, { passive: false });
  function refreshHudButtonsSafe() { if (S) refreshHudButtons(); }

  window.addEventListener('keydown', (e) => {
    lastDevice = 'keyboard';
    if (e.target && e.target.tagName === 'SELECT' && e.key !== 'Escape') return;
    if (screen === 'play' || screen === 'pause') {
      held[e.code] = true;
      const pre = V.PRESETS.find((p) => p.key === e.key);
      if (e.key === ' ') { if (screen === 'play') pause(); else resume(); }
      else if (e.key === 'Escape') goBack();
      else if (pre) { V.applyPreset(vps[active], pre.id); refreshHudButtons(); }
      else if (e.code === 'KeyG') toggleGuide();
      else if (e.code === 'KeyV') toggleSplit();
      else if (e.code === 'KeyF') { vps[active].follow = !vps[active].follow; refreshHudButtons(); }
      else if (e.code === 'KeyC') { S.padX = 0; S.padY = 0; }
      else if (e.code === 'KeyR') restart();
      else if (e.key === '[' || e.key === '-') changeSpeed(-1);
      else if (e.key === ']' || e.key === '=' || e.key === '+') changeSpeed(1);
      else if (!/^(Arrow|Key[WASD])/.test(e.code)) return;
      e.preventDefault();
      return;
    }
    if (e.key === 'Escape') { goBack(); e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { moveFocus(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { moveFocus(-1); e.preventDefault(); }
  });
  window.addEventListener('keyup', (e) => { held[e.code] = false; });
  window.addEventListener('blur', () => { Object.keys(held).forEach((k) => { held[k] = false; }); if (screen === 'play') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && screen === 'play') pause(); });
  window.addEventListener('gamepadconnected', () => { if (screen === 'menu') refreshMenu(); });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), st = $('stage');
    W = st.clientWidth; H = st.clientHeight;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  // ---- start ----
  const startLevelIdx = Math.max(0, Levels.findIndex((l) => l.id === hashArgs.level));
  level = Levels[startLevelIdx]; levelIdx = startLevelIdx;
  attractFor(level);
  setScreen('menu');
  if (hashArgs.screen === 'brief' || hashArgs.autoplay) openBrief(startLevelIdx);
  if (hashArgs.screen === 'settings') setScreen('settings');
  if (hashArgs.screen === 'help') setScreen('help');
  if (hashArgs.autoplay) startRun();
  requestAnimationFrame(frame);
})();
