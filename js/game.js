// Game front end: screens (menu, briefing, play, results), input (pad, keyboard, mouse, gamepad), 3D drawing.
// All physics lives in sim.js, control mapping in controls.js, craft data in crafts.js, guidance in guide.js,
// drawing helpers in view3d.js. Two modes: 'sim' missions with real parameters, 'race' courses that are fiction on purpose.
(function () {
  'use strict';
  const Sim = window.SailSim, Levels = window.SailLevels, Controls = window.SailControls, Guide = window.SailGuide, V = window.SailView, Crafts = window.SailCrafts;
  const Solutions = window.SailSolutions || {};
  const $ = (id) => document.getElementById(id);
  const L = window.SailI18n, t = L.t;

  // Canvas colors come from the --c-* custom properties in index.html, so the page and the drawing share one palette.
  const COL = {};
  (function readPalette() {
    const cs = getComputedStyle(document.documentElement);
    ['star', 'ring', 'goal', 'orbit', 'node', 'axis-x', 'axis-y', 'axis-z', 'sun', 'earth', 'shadow', 'ghost', 'trail', 'predict', 'sail', 'craft', 'normal', 'light', 'guide', 'pad', 'tether', 'star-G', 'star-K', 'star-F', 'star-A', 'star-M']
      .forEach((k) => { COL[k] = cs.getPropertyValue('--c-' + k).trim() || '#888888'; });
    COL.accent = cs.getPropertyValue('--accent').trim(); COL.sunUi = cs.getPropertyValue('--sun').trim(); COL.line = cs.getPropertyValue('--line').trim(); COL.muted = cs.getPropertyValue('--muted').trim();
  })();
  function alpha(hex, a) {
    const h = hex.replace('#', ''), n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  const lvText = (lv, k) => t('lv.' + lv.id + '.' + k);
  const unitT = (lv) => t('unit.' + lv.timeScaleLabel);
  const G0 = 5.93; // solar gravity at 1 AU, mm/s^2, for showing sail pushes in the hangar
  function craftName(id) { const c = Crafts.parse(id); return t('hull.' + c.hull) + ' · ' + c.mechs.map((m) => t('mech.' + m)).join(' + '); }
  const onOff = (v) => t(v ? 'on' : 'off');

  // interface settings, none of these touch the physics
  const CFG = {
    padCone: 80,        // cone angle at the edge of the tilt pad, degrees
    padStep: 0.04,      // the pad is quantized to this step so a run has a manageable number of keyframes
    padSpeed: 0.9,      // pad units per second at full stick or key
    deadzone: 0.18,
    speeds: [0.25, 1, 4, 16, 64],
    attractSpeed: 4,    // background demo flight plays at this multiple of the level's view rate, like the 4x play speed
    attractHold: 3,     // seconds the finished demo flight stays on screen before it starts again
    cameraSpin: 0.12,   // degrees per frame for the idle camera
    autoSpeedIndex: 4
  };

  const canvas = $('view'), ctx = canvas.getContext('2d');
  const padCanvas = $('pad'), pctx = padCanvas.getContext('2d');
  let W = 0, H = 0;

  // ---- settings and records (storage may be blocked, everything works without it) ----
  const settings = { scheme: Controls.order[0], guide: true, flat: false, crafts: Object.assign({}, Crafts.defaults) };
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  (function loadSettings() {
    const s = lsGet('sailSettings');
    if (s) { try { const o = JSON.parse(s); if (Controls.registry[o.scheme]) settings.scheme = o.scheme; if (typeof o.guide === 'boolean') settings.guide = o.guide; if (typeof o.flat === 'boolean') settings.flat = o.flat; if (o.crafts) Object.keys(Crafts.defaults).forEach((m) => { if (typeof o.crafts[m] === 'string' && Crafts.parse(o.crafts[m]).hull) settings.crafts[m] = o.crafts[m]; }); } catch (e) { /* ignore */ } }
  })();
  function saveSettings() { lsSet('sailSettings', JSON.stringify(settings)); }
  // a level flown locked to 2D keeps its own records and reference ghosts, under '<id>@2d'
  function runKey(lv) { return lv.id + (lv.flat ? '@2d' : ''); }
  function bestKey(levelId) { return 'sailBest:' + levelId + ':' + settings.scheme; }
  function loadBest(levelId) { try { return JSON.parse(lsGet(bestKey(levelId)) || 'null'); } catch (e) { return null; } }

  function starsFor(level, time) {
    const m = level.medals;
    return time <= m.gold ? 3 : time <= m.silver ? 2 : time <= m.bronze ? 1 : 0;
  }
  // the craft this level flies with: the player's pick for the mode, or the default when the pick cannot fly here
  function craftFor(lv) { const id = settings.crafts[lv.mode]; return Crafts.problem(id, lv) ? Crafts.defaults[lv.mode] : id; }
  function starString(n) { let s = ''; for (let i = 0; i < 3; i++) s += i < n ? '<b>★</b>' : '★'; return s; }

  // ---- state ----
  let screen = 'menu', levelIdx = 0, level = Levels[0], menuMode = 'sim', garagePick = null;
  let S = null;          // the run in progress or just finished
  let att = null;        // background demo flight
  let briefGuide = settings.guide, briefFlat = settings.flat, ghostPick = { mode: 'off' }, pastedReplay = null;
  let layout = 'one', active = 0;
  const vps = [V.makeViewport('iso'), V.makeViewport('top'), V.makeViewport('side')];
  let lastDevice = 'keyboard', gamepadName = null;
  const held = {};
  const hashArgs = {};
  location.hash.replace(/^#/, '').split('&').forEach((kv) => { const p = kv.split('='); if (p[0]) hashArgs[p[0]] = p[1]; });

  // ---- replay codes: base64 of a small JSON, format v3 with the craft; v2 codes (before crafts) fly the ideal craft ----
  function encodeReplay(run) {
    const o = { v: 3, level: run.level.id, control: run.schemeId, craft: run.craftId, assist: run.assisted, keys: run.keys };
    if (run.level.flat) o.flat = 1;
    return btoa(JSON.stringify(o));
  }
  function decodeReplay(text) {
    const o = JSON.parse(atob(text.trim()));
    const lv = Levels.find((l) => l.id === o.level);
    if (o.v === 2) o.craft = 'photon:ideal';
    if ((o.v !== 2 && o.v !== 3) || !Array.isArray(o.keys) || !Controls.registry[o.control] || !lv || Crafts.problem(o.craft, lv)) throw new Error('bad code');
    if (o.flat && !lv.allow2D) throw new Error('bad code');
    o.flat = !!o.flat;
    return o;
  }

  // ---- screens ----
  const OVERLAYS = { menu: ['menu'], brief: ['brief'], garage: ['garage'], play: ['hud'], result: ['result'], settings: ['menu', 'settings'], help: ['menu', 'help'], about: ['menu', 'about'] };
  const TOP = { menu: 'menu', brief: 'brief', garage: 'garage', play: 'hud', result: 'result', settings: 'settings', help: 'help', about: 'about' };
  function setScreen(name) {
    screen = name;
    ['menu', 'brief', 'garage', 'hud', 'result', 'settings', 'help', 'about'].forEach((id) => $(id).classList.add('hidden'));
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
    if (screen === 'garage') closeGarage();
    else if (screen === 'brief' || screen === 'settings' || screen === 'help' || screen === 'about' || screen === 'result') setScreen('menu');
    else if (screen === 'play') togglePause();
  }

  // ---- menu ----
  function buildMenu() {
    const box = $('levels');
    box.innerHTML = '';
    Levels.forEach((lv, i) => {
      if (lv.mode !== menuMode) return;
      const b = document.createElement('button');
      b.className = 'card'; b.dataset.index = i;
      b.addEventListener('click', () => openBrief(i));
      b.addEventListener('focus', () => { if (screen === 'menu') attractFor(Levels[i]); });
      b.addEventListener('mouseenter', () => { if (screen === 'menu') attractFor(Levels[i]); });
      box.appendChild(b);
    });
  }
  function setMenuMode(m) {
    if (m === menuMode) return;
    menuMode = m; buildMenu(); refreshMenu();
    const first = $('levels').firstElementChild;
    if (first) attractFor(Levels[+first.dataset.index]);
  }
  function levelNumber(lv) { return Levels.filter((l) => l.mode === lv.mode).indexOf(lv) + 1; }
  function levelLabel(lv) { return t(lv.mode === 'race' ? 'menu.course' : 'menu.mission', { n: levelNumber(lv) }); }
  function refreshMenu() {
    Array.prototype.forEach.call($('modeTabs').children, (b) => { b.classList.toggle('on', b.dataset.mode === menuMode); b.setAttribute('aria-pressed', b.dataset.mode === menuMode); });
    Array.prototype.forEach.call($('levels').children, (b) => {
      const lv = Levels[+b.dataset.index], best = loadBest(lv.id);
      b.innerHTML = '<div class="num">' + levelLabel(lv) + '</div><div class="name">' + lvText(lv, 'name') + '</div>' +
        '<div class="goal">' + lvText(lv, 'goal') + '</div>' +
        '<div class="row"><span class="tag ' + lv.difficulty + '">' + t('diff.' + lv.difficulty) + '</span>' +
        '<span class="best">' + (best ? t('menu.best', { t: best.time.toFixed(1), unit: unitT(lv) }) : t('menu.notFlown')) + '</span>' +
        '<span class="stars">' + starString(best ? best.stars : 0) + '</span></div>';
    });
    $('pads').textContent = t(gamepadName ? 'menu.padOn' : 'menu.padOff');
  }

  // ---- briefing ----
  // the level as it will be flown: locked to 2D when the briefing says so and the level allows it
  function runLevel() { return briefFlat && level.allow2D ? Sim.flatLevel(level) : level; }
  function openBrief(i) {
    levelIdx = i; level = Levels[i];
    attractFor(level);
    briefGuide = settings.guide;
    ghostPick = { mode: 'off' };
    fillBrief();
    refreshBriefButtons();
    setScreen('brief');
    $('btnLaunch').focus();
  }
  function fillBrief() {
    $('briefNum').textContent = levelLabel(level) + '  ·  ' + t('diff.' + level.difficulty);
    $('briefFiction').classList.toggle('hidden', level.mode !== 'race');
    $('btnBriefCraft').textContent = craftName(craftFor(level));
    $('briefName').textContent = lvText(level, 'name');
    $('briefGoal').textContent = lvText(level, 'goal');
    $('briefSteps').innerHTML = lvText(level, 'steps').map((x) => '<li>' + x + '</li>').join('');
  }
  function ghostOptions() {
    const opts = [{ mode: 'off', label: t('ghost.off') }];
    const rl = runLevel(), ref = (Solutions[runKey(rl)] || {})[settings.scheme];
    if (ref) opts.push({ mode: 'ref', label: t('ghost.ref'), keys: ref.keys, control: settings.scheme, craft: ref.craft });
    const best = loadBest(runKey(rl));
    if (best && best.code) { try { const d = decodeReplay(best.code); opts.push({ mode: 'best', label: t('ghost.best'), keys: d.keys, control: d.control, craft: d.craft }); } catch (e) { /* ignore */ } }
    if (pastedReplay && pastedReplay.level === level.id && pastedReplay.flat === !!rl.flat) opts.push({ mode: 'code', label: t('ghost.code'), keys: pastedReplay.keys, control: pastedReplay.control, craft: pastedReplay.craft });
    return opts;
  }
  function refreshBriefButtons() {
    $('btnBriefGuide').textContent = onOff(briefGuide);
    $('btnBriefGuide').classList.toggle('on', briefGuide);
    const sel = ghostOptions().find((o) => o.mode === ghostPick.mode) || { label: t('ghost.off') };
    $('btnBriefGhost').textContent = sel.label;
    $('rowBriefFlat').classList.toggle('hidden', !level.allow2D);
    $('btnBriefFlat').textContent = onOff(briefFlat);
    $('btnBriefFlat').classList.toggle('on', briefFlat);
  }

  // ---- background demo flight: the reference solution flying forever behind the menus ----
  function attractFor(lv) {
    if (att && att.level === lv) return;
    const ref = (Solutions[lv.id] || {}).euler;
    att = { level: lv, schemeId: 'euler', craftId: ref ? ref.craft : Crafts.defaults[lv.mode], state: Sim.createState(lv, 'euler', ref ? ref.craft : Crafts.defaults[lv.mode]), keys: ref ? ref.keys : [{ t: 0, a: 0, b: 0 }], cursor: { i: 0 }, trail: [], a: 0, b: 0, wait: 0, tickDebt: 0, predicted: [], ghostState: null, ghostTrail: [] };
  }
  // the demo runs on real time, so it flies at the same pace on every screen refresh rate
  function stepAttract(dt) {
    if (!att) return;
    if (att.state.done) {
      att.wait += dt;
      if (att.wait > CFG.attractHold) { const lv = att.level; att = null; attractFor(lv); }
      return;
    }
    att.tickDebt += dt * CFG.attractSpeed * att.level.view.rate / att.level.dt;
    const n = Math.floor(att.tickDebt);
    att.tickDebt -= n;
    for (let i = 0; i < n && !att.state.done; i++) {
      const k = Sim.controlAt(att.keys, att.state.tick, att.cursor);
      att.a = k.a; att.b = k.b;
      Sim.step(att.state, k.a, k.b);
      if (att.state.tick % 10 === 0) att.trail.push([att.state.x, att.state.y, att.state.z]);
    }
  }

  // ---- a run ----
  function startRun() {
    const scheme = Controls.registry[settings.scheme], craftId = craftFor(level), lv = runLevel();
    const state = Sim.createState(lv, settings.scheme, craftId);
    S = {
      level: lv, schemeId: settings.scheme, scheme: scheme, state: state, craftId: craftId,
      a: scheme.a.start, b: scheme.b.start, keys: [{ t: 0, a: scheme.a.start, b: scheme.b.start }],
      trail: [], predicted: [], tickDebt: 0, speedIdx: 1, paused: false, touched: false,
      guide: briefGuide, assisted: briefGuide, padX: 0, padY: 0,
      rMin: Infinity, rMax: 0, ghostState: null, ghostTrail: [], ghostCursor: { i: 0 }, ghost: null, autoplay: null
    };
    const opt = ghostOptions().find((o) => o.mode === ghostPick.mode);
    if (opt && opt.keys) { S.ghost = opt; S.ghostState = Sim.createState(lv, opt.control, opt.craft); }
    if (hashArgs.autoplay) {
      const ref = (Solutions[runKey(lv)] || {})[settings.scheme];
      if (ref) { S.autoplay = { keys: ref.keys, cursor: { i: 0 } }; S.speedIdx = CFG.autoSpeedIndex; }
    }
    vps.forEach((vp) => { vp.zoom = 1; });
    V.applyPreset(vps[0], 'iso');
    $('lvlName').textContent = lvText(level, 'name');
    $('padBox').classList.add('nudge');
    $('pausedTag').classList.add('hidden');
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
    if (S.level.flat) S.padY = 0; // Lock 2D: the pad only leans forward and back
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
      const o = Sim.nearest(st), r = Math.hypot(st.x - o[0], st.y - o[1], st.z - o[2]);
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
    const n = level.light === 'central' ? 500 : level.light === 'stars' ? 1200 : 700, every = level.light === 'stars' ? 8 : 4;
    for (let i = 0; i < n && !s.done; i++) {
      Sim.step(s, S.a, S.b);
      if (i % every === 0) S.predicted.push([s.x, s.y, s.z]);
    }
  }

  // Pause stops the clock only. The scene stays in view, the camera turns and zooms, and the pad still sets the sail,
  // so a pilot can stop, look round and line up the next push. Leaving the page does not pause.
  function togglePause() {
    if (screen !== 'play') return;
    S.paused = !S.paused;
    $('pausedTag').classList.toggle('hidden', !S.paused);
  }
  function restart() { startRun(); }

  // ---- results ----
  function finishRun() {
    const st = S.state, lv = S.level, time = st.tick * lv.dt, ok = st.done === 'success';
    const stars = ok ? starsFor(lv, time) : 0;
    const best = loadBest(runKey(lv));
    let record = false;
    if (ok && (!best || time < best.time)) {
      record = true;
      lsSet(bestKey(runKey(lv)), JSON.stringify({ time: time, keys: S.keys.length, stars: stars, assisted: S.assisted, code: encodeReplay(S) }));
    }
    const m = lv.medals, unit = unitT(lv);
    $('resultTitle').textContent = t(ok ? 'res.ok' : st.done === 'fail' ? 'res.fail' : 'res.time');
    $('resultTitle').className = ok ? 'ok' : 'bad';
    $('medals').innerHTML = ok ? starString(stars) : '';
    $('resultTime').textContent = time.toFixed(1);
    $('resultUnit').textContent = unit;
    $('resultBanner').innerHTML = record ? '<span class="banner">' + t('res.record') + '</span>' : '';
    let msg;
    if (!ok) msg = t(st.done === 'fail' ? 'res.msgFail' : 'res.msgTime');
    else if (stars === 3) msg = t('res.msg3');
    else if (stars === 2) msg = t('res.msg2', { n: m.gold, unit: unit });
    else if (stars === 1) msg = t('res.msg1', { n: m.silver, unit: unit });
    else msg = t('res.msg0', { n: m.bronze, unit: unit });
    $('resultMsg').textContent = msg;
    const stat = (k, v) => '<div class="stat"><div class="k">' + k + '</div><div class="v">' + v + '</div></div>';
    $('resultStats').innerHTML =
      stat(t('res.adjust'), S.keys.length) +
      stat(t('res.closest'), S.rMin === Infinity ? '-' : S.rMin.toFixed(2) + ' ' + lv.unitLen) +
      stat(t('res.farthest'), S.rMax.toFixed(2) + ' ' + lv.unitLen) +
      stat(t('res.guide'), t(S.assisted ? 'res.used' : 'res.none'));
    if (lv.mode === 'race') $('resultStats').innerHTML = stat(t('res.adjust'), S.keys.length) + stat(t('res.closestStar'), S.rMin === Infinity ? '-' : S.rMin.toFixed(2) + ' ' + lv.unitLen) + stat(t('res.guide'), t(S.assisted ? 'res.used' : 'res.none'));
    $('resultCraft').textContent = craftName(S.craftId) + (lv.flat ? ' · ' + t('brief.flat') : '');
    const hasNext = levelIdx + 1 < Levels.length && Levels[levelIdx + 1].mode === lv.mode;
    $('btnNext').classList.toggle('hidden', !(ok && hasNext));
    $('btnCopy').classList.toggle('hidden', !ok);
    vps[0].mode = 'free';
    setScreen('result');
    const first = ok && hasNext ? $('btnNext') : $('btnRetry');
    first.focus();
  }

  // ---- HUD ----
  function progressNow() {
    const st = S.state, lv = S.level;
    if (lv.mode === 'race') {
      const c = lv.goal.center, r = Math.hypot(st.x - c[0], st.y - c[1], st.z - c[2]);
      return { p: r / lv.goal.r, text: t('hud.edge'), val: r.toFixed(1) + ' / ' + lv.goal.r + ' ' + lv.unitLen };
    }
    if (lv.goal.minInc !== undefined) {
      const inc = Sim.inclinationDeg(st), shown = inc > 90 ? 180 - inc : inc;
      return { p: shown / lv.goal.minInc, text: t('hud.tilt'), val: shown.toFixed(0) + '° / ' + lv.goal.minInc + '°' };
    }
    const r = Math.sqrt(st.x * st.x + st.y * st.y + st.z * st.z);
    return { p: (r - 1) / (lv.goal.rMin - 1), text: t('hud.distSun'), val: r.toFixed(2) + ' / ' + lv.goal.rMin + ' ' + lv.unitLen };
  }
  function coachText(p) {
    if (!S.touched && !S.autoplay) return t('hint.first');
    const texts = lvText(S.level, 'hints');
    let out = '';
    S.level.hintAt.forEach((at, i) => { if (p >= at) out = texts[i] || ''; });
    return out;
  }
  function updateHud() {
    const st = S.state, lv = S.level, pr = progressNow();
    $('timer').innerHTML = (st.tick * lv.dt).toFixed(1) + '<small>' + unitT(lv) + '</small>';
    $('goalText').textContent = pr.text; $('goalVal').textContent = pr.val;
    $('goalBar').firstElementChild.style.width = Math.max(0, Math.min(100, pr.p * 100)) + '%';
    $('coach').textContent = coachText(pr.p);
    $('padBox').classList.toggle('nudge', !S.touched && !S.autoplay);
    $('angles').textContent = t('scheme.' + S.schemeId + '.a') + ' ' + S.a + '°   ' + t('scheme.' + S.schemeId + '.b') + ' ' + S.b + '°';
    $('speedLabel').textContent = CFG.speeds[S.speedIdx] + 'x';
    $('btnPause').textContent = t(S.paused ? 'hud.resume' : 'hud.pause');
    $('keyhints').innerHTML = t(lastDevice === 'pad' ? 'keys.pad' : 'keys.kb');
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
    pctx.strokeStyle = alpha(COL.pad, 0.35); pctx.lineWidth = 2;
    pctx.beginPath(); pctx.arc(c, c, R, 0, 6.2832); pctx.stroke();
    pctx.beginPath(); pctx.moveTo(c - R, c); pctx.lineTo(c + R, c); if (!S.level.flat) { pctx.moveTo(c, c - R); pctx.lineTo(c, c + R); } pctx.stroke();
    if (S.level.flat) { pctx.strokeStyle = alpha(COL.accent, 0.8); pctx.lineWidth = 4; pctx.beginPath(); pctx.moveTo(c - R, c); pctx.lineTo(c + R, c); pctx.stroke(); }
    pctx.fillStyle = alpha(COL.pad, 0.8); pctx.font = '500 22px "IBM Plex Sans", system-ui, sans-serif'; pctx.textAlign = 'center';
    pctx.fillText(t('hud.forward'), c + R - 44, c - 10); pctx.fillText(S.level.flat ? t('brief.flat') : t('hud.pole'), c + 30, c - R + 28);
    let gp = null;
    if (S.guide) {
      const wn = Guide.wanted(S.state, S.level.autopilot);
      gp = Guide.localToPad(wn[0], wn[1], CFG.padCone);
      pctx.strokeStyle = alpha(COL.guide, 0.35); pctx.setLineDash([6, 6]);
      pctx.beginPath(); pctx.arc(c, c, Math.hypot(gp[0], gp[1]) * R, 0, 6.2832); pctx.stroke(); pctx.setLineDash([]);
      const pulse = 1 + 0.12 * Math.sin(performance.now() / 260);
      pctx.fillStyle = COL.guide;
      pctx.beginPath(); pctx.arc(c + gp[0] * R, c - gp[1] * R, 13 * pulse, 0, 6.2832); pctx.fill();
    }
    if (S.state.chord) {
      const ap = Guide.localToPad(S.state.n1, S.state.n2, CFG.padCone);
      pctx.strokeStyle = alpha(COL.sail, 0.9); pctx.lineWidth = 3; pctx.setLineDash([4, 4]);
      pctx.beginPath(); pctx.arc(c + ap[0] * R, c - ap[1] * R, 17, 0, 6.2832); pctx.stroke(); pctx.setLineDash([]);
    }
    const q = CFG.padStep, px = Math.round(S.padX / q) * q, py = Math.round(S.padY / q) * q;
    if (gp) { pctx.strokeStyle = alpha(COL.craft, 0.3); pctx.lineWidth = 2; pctx.beginPath(); pctx.moveTo(c + px * R, c - py * R); pctx.lineTo(c + gp[0] * R, c - gp[1] * R); pctx.stroke(); }
    pctx.fillStyle = COL.craft; pctx.strokeStyle = COL.accent; pctx.lineWidth = 3;
    pctx.beginPath(); pctx.arc(c + px * R, c - py * R, 11, 0, 6.2832); pctx.fill(); pctx.stroke();
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
    else if (lv.light === 'stars') { const F = Sim.frame(st, {}); l = [F.lx, F.ly, F.lz]; }
    else { const r = Math.hypot(st.x, st.y, st.z) || 1; l = [st.x / r, st.y / r, st.z / r]; }
    V.updateDynamic(vp, h, l);
    V.prep(vp, span, vp.follow ? me : (lv.view.center || [0, 0, 0]));
    ctx.save();
    ctx.beginPath(); ctx.rect(R.x, R.y, R.w, R.h); ctx.clip();

    const X = [1, 0, 0], Y = [0, 1, 0], Zv = [0, 0, 1], O = [0, 0, 0];
    if (lv.light === 'stars') drawCourse(vp, sc, opts, span);
    else drawSystem(vp, sc, opts, span, me, h, l);
    V.polyline(ctx, vp, sc.ghostTrail || [], COL.ghost, 1.5);
    V.polyline(ctx, vp, sc.trail, COL.trail, 2);
    if (opts.predict) V.polyline(ctx, vp, sc.predicted, alpha(COL.predict, 0.75), 1.5, [5, 5]);
    if (sc.ghostState) V.disc(ctx, vp, [sc.ghostState.x, sc.ghostState.y, sc.ghostState.z], span * 0.012, COL.ghost, 4);
    drawCraft(vp, st, span, me, l);

    if (opts.split) {
      ctx.fillStyle = COL.muted; ctx.font = '500 14px "IBM Plex Sans", system-ui, sans-serif';
      const p = V.PRESETS.find((pp) => pp.id === vp.mode);
      ctx.fillText(t(p ? 'view.' + p.id : 'view.free') + (vp.follow ? t('view.following') : ''), R.x + 12, R.y + R.h - 12);
    }
    ctx.restore();
    if (opts.split) { ctx.strokeStyle = idx === active ? COL.sunUi : COL.line; ctx.lineWidth = idx === active ? 2 : 1; ctx.strokeRect(R.x + 0.5, R.y + 0.5, R.w - 1, R.h - 1); }
  }

  // a single central body: the Sun, or the Earth with its shadow
  function drawSystem(vp, sc, opts, span, me, h, l) {
    const lv = sc.level, st = sc.state;
    const X = [1, 0, 0], Y = [0, 1, 0], Zv = [0, 0, 1], O = [0, 0, 0];
    const rings = lv.light === 'central' ? (lv.goal.minInc === undefined ? [1, lv.goal.rMin] : [1]) : [lv.goal.rMin, 7, lv.goal.rMax];
    rings.forEach((r, i) => V.polyline(ctx, vp, V.circlePoints(O, r, X, Y, 96), (lv.goal.minInc === undefined && i === 1) ? alpha(COL.goal, 0.8) : COL.ring, (lv.goal.minInc === undefined && i === 1) ? 2 : 1));
    const ax = span * 0.5;
    V.segment(ctx, vp, O, [ax, 0, 0], COL['axis-x'], 1); V.segment(ctx, vp, O, [0, ax, 0], COL['axis-y'], 1); V.segment(ctx, vp, O, [0, 0, ax], COL['axis-z'], 1);

    const rNow = Math.hypot(me[0], me[1], me[2]);
    if (rNow > 1e-9) {
      const e1 = [me[0] / rNow, me[1] / rNow, me[2] / rNow], e2 = V.cross(h, e1);
      V.polyline(ctx, vp, V.circlePoints(O, rNow, e1, e2, 96), alpha(COL.orbit, 0.5), 1.5);
      if (opts.guide && lv.autopilot.law === 'incline') {
        const nd = Guide.nodeDirection(st), k = rNow * 1.2;
        V.segment(ctx, vp, [-nd[0] * k, -nd[1] * k, 0], [nd[0] * k, nd[1] * k, 0], COL.node, 2);
      }
    }

    // central body
    const c0 = V.project(vp, O);
    if (lv.light === 'central') {
      if (c0) {
        const g = ctx.createRadialGradient(c0[0], c0[1], 2, c0[0], c0[1], 44 * c0[2]);
        g.addColorStop(0, alpha(COL.sun, 0.55)); g.addColorStop(1, alpha(COL.sun, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c0[0], c0[1], 60 * c0[2], 0, 6.2832); ctx.fill();
      }
      V.disc(ctx, vp, O, span * 0.03, COL.sun, 6);
    } else {
      V.disc(ctx, vp, O, lv.bodyRadius, COL.earth, 5);
      const p2 = V.cross(l, Zv), len = span * 1.2, b = lv.bodyRadius;
      const a0 = V.circlePoints(O, b, Zv, p2, 24), a1 = V.circlePoints(V.add(O, l, len), b, Zv, p2, 24);
      V.polyline(ctx, vp, a0, alpha(COL.shadow, 0.45), 1); V.polyline(ctx, vp, a1, alpha(COL.shadow, 0.2), 1);
      for (let i = 0; i < 24; i += 6) V.segment(ctx, vp, a0[i], a1[i], alpha(COL.shadow, 0.2), 1);
    }
  }

  // race field: the boundary sphere (finish line, drawn as three great circles), the stars with a glow that grows with
  // their light and their overheating ring
  function drawCourse(vp, sc, opts, span) {
    const lv = sc.level, X = [1, 0, 0], Y = [0, 1, 0], Zv = [0, 0, 1], c = lv.goal.center, R = lv.goal.r;
    V.polyline(ctx, vp, V.circlePoints(c, R, X, Y, 128), alpha(COL.goal, 0.85), 2, [8, 6]);
    V.polyline(ctx, vp, V.circlePoints(c, R, X, Zv, 96), alpha(COL.goal, 0.3), 1, [4, 6]);
    V.polyline(ctx, vp, V.circlePoints(c, R, Y, Zv, 96), alpha(COL.goal, 0.3), 1, [4, 6]);
    V.disc(ctx, vp, lv.start.pos, span * 0.006, alpha(COL.goal, 0.7), 2);
    lv.stars.forEach((s) => {
      const col = COL['star-' + s.type] || COL.sun, c0 = V.project(vp, s.pos), glow = 14 + 16 * Math.pow(s.lum, 0.3);
      if (c0) {
        const g = ctx.createRadialGradient(c0[0], c0[1], 1, c0[0], c0[1], glow * c0[2]);
        g.addColorStop(0, alpha(col, 0.5)); g.addColorStop(1, alpha(col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c0[0], c0[1], glow * c0[2], 0, 6.2832); ctx.fill();
      }
      V.disc(ctx, vp, s.pos, span * 0.012 * Math.pow(s.mass, 0.5), col, 2.5);
      V.polyline(ctx, vp, V.circlePoints(s.pos, s.rMin, X, Y, 32), alpha(COL.normal, 0.35), 1, [3, 4]);
    });
  }

  // the craft: a film square, tethers for an electric sail, both for a hybrid; the red line is the real sail normal
  function drawCraft(vp, st, span, me, l) {
    const X = [1, 0, 0], Zv = [0, 0, 1];
    const nrm = Sim.actualNormal(st, {}), n = [nrm.x, nrm.y, nrm.z];
    const ref = Math.abs(n[2]) < 0.9 ? Zv : X, s1 = V.norm(V.cross(n, ref)), s2 = V.cross(n, s1), q = span * 0.045;
    if (st.craft.beta > 0) {
      const corners = [[1, 1], [1, -1], [-1, -1], [-1, 1]].map((c) => V.add(V.add(me, s1, c[0] * q), s2, c[1] * q));
      fillPoly(vp, corners, alpha(COL.sail, 0.45));
      V.polyline(ctx, vp, corners.concat([corners[0]]), COL.sail, 1.5);
    }
    if (st.craft.kappa > 0) {
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.2832, d = V.add(V.add([0, 0, 0], s1, Math.cos(a)), s2, Math.sin(a));
        V.segment(ctx, vp, me, V.add(me, d, q * 2.2), alpha(COL.tether, 0.8), 1);
      }
    }
    V.disc(ctx, vp, me, span * 0.009, COL.craft, 3);
    V.segment(ctx, vp, me, V.add(me, n, span * 0.13), COL.normal, 2.5);
    V.segment(ctx, vp, me, V.add(me, l, -span * 0.13), COL.light, 2);
  }

  function drawScene(sc, layoutName, opts) {
    const rects = V.LAYOUTS[layoutName];
    rects.forEach((r, i) => { vps[i].rect = { x: r[0] * W, y: r[1] * H, w: r[2] * W, h: r[3] * H }; });
    if (active >= rects.length) active = 0;
    for (let i = 0; i < rects.length; i++) drawViewport(vps[i], i, sc, Object.assign({ split: rects.length > 1 }, opts));
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL.star;
    stars.forEach((s) => { ctx.globalAlpha = 0.18 + s[2] * 0.22; ctx.fillRect(s[0] * W, s[1] * H, s[2], s[2]); });
    ctx.globalAlpha = 1;
    if (screen === 'play') {
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
    if (screen === 'play') {
      const kx = (held.ArrowRight || held.KeyD ? 1 : 0) - (held.ArrowLeft || held.KeyA ? 1 : 0);
      const ky = (held.ArrowUp || held.KeyW ? 1 : 0) - (held.ArrowDown || held.KeyS ? 1 : 0);
      if (kx || ky) movePad(kx * CFG.padSpeed * dt, ky * CFG.padSpeed * dt);
      if (!S.autoplay) applyPad();
      if (!S.paused && !S.state.done) {
        S.tickDebt += dt * CFG.speeds[S.speedIdx] * S.level.view.rate / S.level.dt;
        let n = Math.floor(S.tickDebt);
        S.tickDebt -= n;
        if (n > 4000) n = 4000;
        for (let i = 0; i < n && !S.state.done && screen === 'play'; i++) tickOnce();
      }
      if (screen === 'play') { predict(); updateHud(); drawPad(); }
    } else {
      stepAttract(dt);
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
    const playing = screen === 'play';
    if (playing) {
      if (ax(0) || ax(1)) movePad(ax(0) * CFG.padSpeed * dt, -ax(1) * CFG.padSpeed * dt);
      const vp = vps[active];
      if (ax(2) || ax(3)) { vp.mode = 'free'; vp.az -= ax(2) * 120 * dt; vp.el = Math.max(-90, Math.min(90, vp.el + ax(3) * 90 * dt)); }
      const zin = gp.buttons[7] ? gp.buttons[7].value : 0, zout = gp.buttons[6] ? gp.buttons[6].value : 0;
      if (zin > 0.1 || zout > 0.1) vp.zoom = Math.max(0.15, Math.min(40, vp.zoom * Math.pow(1.8, (zin - zout) * dt)));
      if (edge(0) || edge(9) || (edge(1) && S.paused)) togglePause();
      if (edge(2) || edge(15)) cyclePreset(1);
      if (edge(14)) cyclePreset(-1);
      if (edge(3)) toggleGuide();
      if (edge(4)) changeSpeed(-1);
      if (edge(5)) changeSpeed(1);
      if (edge(8)) toggleSplit();
      if (edge(10)) { S.padX = 0; S.padY = 0; }
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

  // ---- hangar: pick the sail and the attitude mechanisms before a launch ----
  function openGarage() {
    garagePick = Crafts.parse(craftFor(level));
    fillGarage();
    setScreen('garage');
  }
  function closeGarage() {
    settings.crafts[level.mode] = Crafts.idOf(garagePick.hull, garagePick.mechs);
    saveSettings();
    setScreen('brief');
    fillBrief();
    $('btnBriefCraft').focus();
  }
  function fillGarage() {
    const pick = garagePick, hb = $('garageHulls'), mb = $('garageMechs');
    hb.innerHTML = ''; mb.innerHTML = '';
    Crafts.hullOrder.forEach((h) => {
      if (Crafts.hulls[h].modes.indexOf(level.mode) < 0) return;
      const b = document.createElement('button');
      const why = Crafts.problem(Crafts.idOf(h, [Crafts.hulls[h].mechs[0]]), level);
      b.className = 'btn small' + (pick.hull === h ? ' on' : ''); b.textContent = t('hull.' + h); b.disabled = !!why;
      if (why) b.title = t('garage.' + why);
      b.addEventListener('click', () => {
        if (pick.hull === h) return;
        pick.hull = h;
        const allowed = Crafts.hulls[h].mechs;
        pick.mechs = pick.mechs.filter((m) => allowed.indexOf(m) >= 0);
        if (!pick.mechs.length) pick.mechs = [allowed[0]];
        fillGarage(); hb.querySelector('.on').focus();
      });
      hb.appendChild(b);
    });
    Crafts.hulls[pick.hull].mechs.forEach((m) => {
      const b = document.createElement('button'), on = pick.mechs.indexOf(m) >= 0;
      b.className = 'btn small' + (on ? ' on' : ''); b.textContent = t('mech.' + m); b.title = t('mech.' + m + '.d');
      b.setAttribute('aria-pressed', on);
      b.addEventListener('click', () => {
        const i = pick.mechs.indexOf(m);
        if (i >= 0) { if (pick.mechs.length > 1) pick.mechs.splice(i, 1); } else pick.mechs.push(m);
        pick.mechs.sort((x, y) => Crafts.hulls[pick.hull].mechs.indexOf(x) - Crafts.hulls[pick.hull].mechs.indexOf(y));
        fillGarage(); mb.children[Crafts.hulls[pick.hull].mechs.indexOf(m)].focus();
      });
      mb.appendChild(b);
    });
    const d = Crafts.derive(Crafts.idOf(pick.hull, pick.mechs), level);
    const push = [];
    if (d.beta > 0) push.push((d.beta * G0).toFixed(2) + ' mm/s²');
    if (d.kappa > 0) push.push((d.kappa * G0).toFixed(2) + ' mm/s²');
    const fall = d.beta > 0 && d.kappa > 0 ? t('garage.r2r1') : d.beta > 0 ? t('garage.r2') : t('garage.r1');
    const row = (k, v) => '<tr><td>' + k + '</td><td>' + v + '</td></tr>';
    $('garageStats').innerHTML = row(t('garage.thrust'), push.join(' + ')) + row(t('garage.falloff'), fall) +
      row(t('garage.turn'), d.ratePerHour + ' °/h') + row(t('garage.mass'), '+' + Math.round(d.mass * 100) + '%');
    $('garageDesc').innerHTML = '<b>' + t('hull.' + pick.hull) + '</b> ' + t('hull.' + pick.hull + '.d') + '<br>' +
      pick.mechs.map((m) => '<b>' + t('mech.' + m) + '</b> ' + t('mech.' + m + '.d')).join('<br>');
    const blocked = Crafts.hullOrder.filter((h) => Crafts.hulls[h].modes.indexOf(level.mode) >= 0 && Crafts.problem(Crafts.idOf(h, [Crafts.hulls[h].mechs[0]]), level) === 'noWind');
    $('garageWarn').textContent = blocked.length ? t('garage.noWind') : '';
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
  Array.prototype.forEach.call($('modeTabs').children, (b) => b.addEventListener('click', () => setMenuMode(b.dataset.mode)));
  buildMenu();
  V.PRESETS.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'btn small'; b.dataset.preset = p.id;
    b.addEventListener('click', () => { V.applyPreset(vps[active], p.id); refreshHudButtons(); });
    $('presets').appendChild(b);
  });
  Controls.order.forEach((id) => { const o = document.createElement('option'); o.value = id; $('selScheme').appendChild(o); });
  $('selScheme').value = settings.scheme;
  $('btnDefGuide').classList.toggle('on', settings.guide);
  ['selLang', 'selLangHome'].forEach((id) => {
    L.order.forEach((code) => { const o = document.createElement('option'); o.value = code; o.textContent = L.names[code]; $(id).appendChild(o); });
    $(id).addEventListener('change', (e) => { L.setLang(e.target.value, true); relabel(); });
  });

  // texts built in code, refreshed whenever the language changes
  // changelog in About, from js/changelog.js; a language without its own list falls back to English
  function fillChangelog() {
    const esc = (x) => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    $('changelog').innerHTML = (window.SailChangelog || []).map((e) => '<h3>' + e.v + '  ·  ' + e.date + '</h3><ul>' +
      (e.items[L.lang] || e.items.en).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>').join('');
  }
  function relabel() {
    $('selLang').value = L.lang; $('selLangHome').value = L.lang;
    fillChangelog();
    Array.prototype.forEach.call($('presets').children, (b) => { const p = V.PRESETS.find((q) => q.id === b.dataset.preset); b.textContent = t('view.' + p.id); b.title = t('hud.keyTitle', { k: p.key }); });
    Array.prototype.forEach.call($('selScheme').options, (o) => { o.textContent = t('scheme.' + o.value); });
    $('btnDefGuide').textContent = onOff(settings.guide);
    refreshMenu();
    if (screen === 'brief') { fillBrief(); refreshBriefButtons(); }
    if (screen === 'garage') fillGarage();
  }

  $('btnHelp').addEventListener('click', () => setScreen('help'));
  $('btnHelpBack').addEventListener('click', () => setScreen('menu'));
  $('btnSettings').addEventListener('click', () => setScreen('settings'));
  $('btnSettingsBack').addEventListener('click', () => setScreen('menu'));
  $('btnAbout').addEventListener('click', () => setScreen('about'));
  $('btnAboutBack').addEventListener('click', () => setScreen('menu'));
  $('selScheme').addEventListener('change', (e) => { settings.scheme = e.target.value; saveSettings(); });
  $('btnDefGuide').addEventListener('click', () => { settings.guide = !settings.guide; saveSettings(); $('btnDefGuide').textContent = onOff(settings.guide); $('btnDefGuide').classList.toggle('on', settings.guide); });
  $('btnGhostCode').addEventListener('click', () => {
    const code = window.prompt(t('prompt.paste'));
    if (!code) return;
    try { pastedReplay = decodeReplay(code); const i = Levels.findIndex((l) => l.id === pastedReplay.level); setMenuMode(Levels[i].mode); openBrief(i); briefFlat = pastedReplay.flat; ghostPick = { mode: 'code' }; refreshBriefButtons(); }
    catch (e) { window.alert(t('prompt.bad')); }
  });
  $('btnBriefBack').addEventListener('click', () => setScreen('menu'));
  $('btnBriefCraft').addEventListener('click', openGarage);
  $('btnGarageDone').addEventListener('click', closeGarage);
  $('btnBriefGuide').addEventListener('click', () => { briefGuide = !briefGuide; refreshBriefButtons(); });
  $('btnBriefFlat').addEventListener('click', () => { briefFlat = !briefFlat; settings.flat = briefFlat; saveSettings(); ghostPick = { mode: 'off' }; refreshBriefButtons(); });
  $('btnBriefGhost').addEventListener('click', () => {
    const opts = ghostOptions(), i = Math.max(0, opts.findIndex((o) => o.mode === ghostPick.mode));
    ghostPick = { mode: opts[(i + 1) % opts.length].mode };
    refreshBriefButtons();
  });
  $('btnLaunch').addEventListener('click', startRun);
  $('btnPause').addEventListener('click', togglePause);
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
    const done = () => { b.textContent = t('res.copied'); setTimeout(() => { b.textContent = t('res.copy'); }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, () => window.prompt(t('prompt.copy'), code));
    else window.prompt(t('prompt.copy'), code);
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
    if (screen !== 'play' && screen !== 'result') return;
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
    if (screen === 'play') {
      held[e.code] = true;
      const pre = V.PRESETS.find((p) => p.key === e.key);
      if (e.key === ' ') togglePause();
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
  window.addEventListener('blur', () => { Object.keys(held).forEach((k) => { held[k] = false; }); });
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
  // the version is written once, on the html element, and shown in the footer and the About page
  document.querySelectorAll('.ver').forEach((el) => { el.textContent = document.documentElement.dataset.version; });
  L.setLang(hashArgs.lang || L.detect(), false);
  relabel();
  let startLevelIdx = Math.max(0, Levels.findIndex((l) => l.id === hashArgs.level));
  if (hashArgs.mode === 'race' && Levels[startLevelIdx].mode !== 'race') startLevelIdx = Levels.findIndex((l) => l.mode === 'race');
  level = Levels[startLevelIdx]; levelIdx = startLevelIdx;
  if (level.mode === 'race') setMenuMode('race');
  attractFor(level);
  setScreen('menu');
  if (hashArgs.flat === '1') briefFlat = true;
  if (hashArgs.screen === 'brief' || hashArgs.autoplay) openBrief(startLevelIdx);
  if (hashArgs.screen === 'settings') setScreen('settings');
  if (hashArgs.screen === 'help') setScreen('help');
  if (hashArgs.screen === 'about') setScreen('about');
  if (hashArgs.screen === 'garage') { openBrief(startLevelIdx); openGarage(); }
  if (hashArgs.autoplay) startRun();
  requestAnimationFrame(frame);
})();
