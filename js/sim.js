// Deterministic sail simulation core.
// Uses only + - * / and sqrt (all exactly specified by IEEE 754) plus the table trig of trig.js,
// so a replay gives bit-identical results in every browser and in Node.
// The control scheme (how two whole-degree numbers become a wanted sail normal) is a plug-in, see controls.js.
// The craft (sail type and attitude mechanisms) is data, see crafts.js: the hull sets the force law, the mechanisms
// limit how fast the real sail normal follows the wanted one.
// Environments: 'central' (light at the central body), 'external' (planet with a distant Sun and a shadow),
// 'stars' (several fixed stars, each with gravity, light and wind; race mode).
// Works as a classic script (window.SailSim) and as a CommonJS module.
(function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const T = isNode ? require('./trig.js') : root.SailTrig;
  const C = isNode ? require('./controls.js') : root.SailControls;
  const K = isNode ? require('./crafts.js') : root.SailCrafts;
  const PI = T.PI;

  // ---- control track: piecewise constant keyframes {t, a, b}, t in ticks, a and b in whole degrees ----
  function controlAt(keys, tick, cursor) {
    while (cursor.i + 1 < keys.length && keys[cursor.i + 1].t <= tick) cursor.i++;
    return keys.length ? keys[cursor.i] : { t: 0, a: 0, b: 0 };
  }

  function createState(level, schemeId, craftId) {
    const scheme = C.registry[schemeId || C.order[0]];
    const craft = K.derive(craftId || 'photon:ideal', level);
    const s = {
      level, scheme, craft, tick: 0,
      x: level.start.pos[0], y: level.start.pos[1], z: level.start.pos[2],
      vx: level.start.vel[0], vy: level.start.vel[1], vz: level.start.vel[2],
      // the real sail normal in the light frame (e1, e2, l); starts facing the light
      n1: 0, n2: 0, n3: 1,
      // largest chord the normal may move per tick, 2 sin(turn / 2); 0 means instant
      chord: 0,
      // direction light travels (source to craft); only used when the light is external to the central body
      lx: 1, ly: 0, lz: 0,
      rotC: 1, rotS: 0, // per tick rotation of the light direction
      done: null
    };
    if (craft.turnPerUnit > 0) {
      const turn = craft.turnPerUnit * level.dt * PI / 180;
      s.chord = turn >= PI ? 0 : 2 * T.sinRad(turn * 0.5);
    }
    if (level.light === 'external') {
      const w = level.lightRate * level.dt; // rad per tick
      s.rotC = T.cosRad(w); s.rotS = T.sinRad(w);
      s.lx = level.lightStart[0]; s.ly = level.lightStart[1]; s.lz = 0;
    }
    return s;
  }

  // race mode: the star whose gravity is strongest here, the reference for "forward" and "pole"
  function dominant(s) {
    const st = s.level.stars;
    let best = 0, bestG = -1;
    for (let i = 0; i < st.length; i++) {
      const dx = s.x - st[i].pos[0], dy = s.y - st[i].pos[1], dz = s.z - st[i].pos[2];
      const g = st[i].mass / (dx * dx + dy * dy + dz * dz);
      if (g > bestG) { bestG = g; best = i; }
    }
    return best;
  }

  // light direction l and reference axes e1, e2
  function frame(s, out) {
    const lv = s.level;
    let lx, ly, lz, e2x, e2y, e2z;
    if (lv.light === 'central') {
      const r = Math.sqrt(s.x * s.x + s.y * s.y + s.z * s.z);
      lx = s.x / r; ly = s.y / r; lz = s.z / r;
      let hx = s.y * s.vz - s.z * s.vy, hy = s.z * s.vx - s.x * s.vz, hz = s.x * s.vy - s.y * s.vx;
      let hn = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (hn < 1e-12) { hx = 0; hy = 0; hz = 1; hn = 1; }
      e2x = hx / hn; e2y = hy / hn; e2z = hz / hn;
    } else if (lv.light === 'stars') {
      // l: the summed push direction (light for film sails, wind for a pure electric sail)
      const st = lv.stars, wind = s.craft.beta === 0;
      lx = 0; ly = 0; lz = 0;
      for (let i = 0; i < st.length; i++) {
        const dx = s.x - st[i].pos[0], dy = s.y - st[i].pos[1], dz = s.z - st[i].pos[2];
        const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
        const w = wind ? st[i].wind / (r * r) : st[i].lum / (r2 * r);
        lx += w * dx; ly += w * dy; lz += w * dz;
      }
      const ln = Math.sqrt(lx * lx + ly * ly + lz * lz) || 1;
      lx /= ln; ly /= ln; lz /= ln;
      const k = st[dominant(s)].pos, px = s.x - k[0], py = s.y - k[1], pz = s.z - k[2];
      let hx = py * s.vz - pz * s.vy, hy = pz * s.vx - px * s.vz, hz = px * s.vy - py * s.vx;
      let hn = Math.sqrt(hx * hx + hy * hy + hz * hz);
      if (hn < 1e-12) { hx = 0; hy = 0; hz = 1; hn = 1; }
      e2x = hx / hn; e2y = hy / hn; e2z = hz / hn;
    } else {
      lx = s.lx; ly = s.ly; lz = s.lz; e2x = 0; e2y = 0; e2z = 1;
    }
    // e1 = e2 x l
    let e1x = e2y * lz - e2z * ly, e1y = e2z * lx - e2x * lz, e1z = e2x * ly - e2y * lx;
    let en = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z);
    if (en < 1e-9) { e1x = ly; e1y = -lx; e1z = 0; en = Math.sqrt(e1x * e1x + e1y * e1y) || 1; }
    e1x /= en; e1y /= en; e1z /= en;
    // race mode: the orbit normal is not square to the summed light, so make e2 square to l and e1
    if (lv.light === 'stars') { e2x = ly * e1z - lz * e1y; e2y = lz * e1x - lx * e1z; e2z = lx * e1y - ly * e1x; }
    out.lx = lx; out.ly = ly; out.lz = lz;
    out.e1x = e1x; out.e1y = e1y; out.e1z = e1z;
    out.e2x = e2x; out.e2y = e2y; out.e2z = e2z;
    return out;
  }

  // the wanted normal for control (a, b), in world axes (display and authoring)
  const F = {}, LOC = {};
  function sailNormal(s, a, b, out) {
    frame(s, F);
    s.scheme.local(a, b, LOC);
    out.x = LOC.l * F.lx + LOC.e1 * F.e1x + LOC.e2 * F.e2x;
    out.y = LOC.l * F.ly + LOC.e1 * F.e1y + LOC.e2 * F.e2y;
    out.z = LOC.l * F.lz + LOC.e1 * F.e1z + LOC.e2 * F.e2z;
    return out;
  }
  // the real normal of the sail now, in world axes
  function actualNormal(s, out) {
    frame(s, F);
    out.x = s.n3 * F.lx + s.n1 * F.e1x + s.n2 * F.e2x;
    out.y = s.n3 * F.ly + s.n1 * F.e1y + s.n2 * F.e2y;
    out.z = s.n3 * F.lz + s.n1 * F.e1z + s.n2 * F.e2z;
    return out;
  }

  // move the real normal toward the wanted one, at most s.chord per tick
  function turnToward(s, t1, t2, t3) {
    if (s.chord === 0) { s.n1 = t1; s.n2 = t2; s.n3 = t3; return; }
    const d1 = t1 - s.n1, d2 = t2 - s.n2, d3 = t3 - s.n3;
    const d = Math.sqrt(d1 * d1 + d2 * d2 + d3 * d3);
    if (d <= s.chord) { s.n1 = t1; s.n2 = t2; s.n3 = t3; return; }
    const k = s.chord / d;
    let m1 = s.n1 + d1 * k, m2 = s.n2 + d2 * k, m3 = s.n3 + d3 * k;
    const m = Math.sqrt(m1 * m1 + m2 * m2 + m3 * m3);
    s.n1 = m1 / m; s.n2 = m2 / m; s.n3 = m3 / m;
  }

  // push of one source on the craft. u: unit vector source to craft, cl = u.n
  // light: beta-weighted photon pressure; wind: kappa-weighted electric sail thrust
  function accel(s, px, py, pz, nx, ny, nz, lx, ly, lz, out) {
    const lv = s.level, cr = s.craft;
    let ax = 0, ay = 0, az = 0;
    if (lv.light === 'stars') {
      const st = lv.stars, mu = lv.mu;
      for (let i = 0; i < st.length; i++) {
        const dx = px - st[i].pos[0], dy = py - st[i].pos[1], dz = pz - st[i].pos[2];
        const r2 = dx * dx + dy * dy + dz * dz, r = Math.sqrt(r2);
        const g = mu * st[i].mass / (r2 * r);
        ax -= g * dx; ay -= g * dy; az -= g * dz;
        const ux = dx / r, uy = dy / r, uz = dz / r, cl = nx * ux + ny * uy + nz * uz;
        if (cr.beta > 0) {
          const m = cr.beta * mu * st[i].lum / r2 * cl * (cl < 0 ? -cl : cl);
          ax += m * nx; ay += m * ny; az += m * nz;
        }
        if (cr.kappa > 0) {
          const m = cr.kappa * mu * st[i].wind / (r * lv.au) * 0.5;
          ax += m * (ux + cl * nx); ay += m * (uy + cl * ny); az += m * (uz + cl * nz);
        }
      }
      out.x = ax; out.y = ay; out.z = az;
      return;
    }
    const r2 = px * px + py * py + pz * pz;
    const r = Math.sqrt(r2);
    const g = lv.mu / (r2 * r);
    ax = -g * px; ay = -g * py; az = -g * pz;
    let lightX = lx, lightY = ly, lightZ = lz;
    if (lv.light === 'central') { lightX = px / r; lightY = py / r; lightZ = pz / r; }
    const cl = nx * lightX + ny * lightY + nz * lightZ;
    if (cl > 0 && cr.beta > 0) {
      let mag;
      if (lv.light === 'central') mag = cr.beta * lv.mu / r2 * cl * cl;
      else {
        mag = lv.sailAccel * (cr.beta / lv.beta) * cl * cl;
        // cylindrical shadow behind the planet
        const along = px * lx + py * ly + pz * lz;
        if (along > 0) {
          const qx = px - along * lx, qy = py - along * ly, qz = pz - along * lz;
          if (qx * qx + qy * qy + qz * qz < lv.bodyRadius * lv.bodyRadius) mag = 0;
        }
      }
      ax += mag * nx; ay += mag * ny; az += mag * nz;
    }
    if (cr.kappa > 0 && lv.light === 'central') {
      const m = cr.kappa * lv.mu / (r * lv.au) * 0.5;
      ax += m * (lightX + cl * nx); ay += m * (lightY + cl * ny); az += m * (lightZ + cl * nz);
    }
    out.x = ax; out.y = ay; out.z = az;
  }

  // Lock 2D: the sail normal keeps no component along e2, the orbit normal. Light, gravity and the sail push then all
  // lie in the plane of the light and the velocity, and a craft that starts in the plane z = 0 among stars in that
  // plane stays in it exactly (the out of plane terms are exact zeros). A normal pointing straight along e2 is edge-on,
  // which gives the same push as the edge-on normal e1.
  function flatten(o) {
    const m = Math.sqrt(o.e1 * o.e1 + o.l * o.l);
    if (m < 1e-12) { o.e1 = 1; o.e2 = 0; o.l = 0; return; }
    o.e1 /= m; o.l /= m; o.e2 = 0;
  }
  // the locked 2D variant of a level: start in the plane z = 0, and for a star field its flat layout
  function flatLevel(level) {
    if (!level.allow2D) return level;
    const p = level.start.pos, v = level.start.vel;
    const out = Object.assign({}, level, { flat: true, start: { pos: [p[0], p[1], 0], vel: [v[0], v[1], 0] } });
    if (level.stars2D) out.stars = level.stars2D;
    if (level.medals2D) out.medals = level.medals2D;
    return out;
  }

  const N = {}, A1 = {}, A2 = {}, A3 = {}, A4 = {};
  function step(s, a, b) {
    const lv = s.level, dt = lv.dt;
    s.scheme.local(a, b, LOC);
    if (lv.flat) flatten(LOC);
    turnToward(s, LOC.e1, LOC.e2, LOC.l);
    actualNormal(s, N);
    const nx = N.x, ny = N.y, nz = N.z;
    const lx = s.lx, ly = s.ly, lz = s.lz;
    const x = s.x, y = s.y, z = s.z, vx = s.vx, vy = s.vy, vz = s.vz;
    accel(s, x, y, z, nx, ny, nz, lx, ly, lz, A1);
    const h = dt * 0.5;
    const x2 = x + h * vx, y2 = y + h * vy, z2 = z + h * vz;
    const v2x = vx + h * A1.x, v2y = vy + h * A1.y, v2z = vz + h * A1.z;
    accel(s, x2, y2, z2, nx, ny, nz, lx, ly, lz, A2);
    const x3 = x + h * v2x, y3 = y + h * v2y, z3 = z + h * v2z;
    const v3x = vx + h * A2.x, v3y = vy + h * A2.y, v3z = vz + h * A2.z;
    accel(s, x3, y3, z3, nx, ny, nz, lx, ly, lz, A3);
    const x4 = x + dt * v3x, y4 = y + dt * v3y, z4 = z + dt * v3z;
    const v4x = vx + dt * A3.x, v4y = vy + dt * A3.y, v4z = vz + dt * A3.z;
    accel(s, x4, y4, z4, nx, ny, nz, lx, ly, lz, A4);
    const d6 = dt / 6;
    s.x = x + d6 * (vx + 2 * v2x + 2 * v3x + v4x);
    s.y = y + d6 * (vy + 2 * v2y + 2 * v3y + v4y);
    s.z = z + d6 * (vz + 2 * v2z + 2 * v3z + v4z);
    s.vx = vx + d6 * (A1.x + 2 * A2.x + 2 * A3.x + A4.x);
    s.vy = vy + d6 * (A1.y + 2 * A2.y + 2 * A3.y + A4.y);
    s.vz = vz + d6 * (A1.z + 2 * A2.z + 2 * A3.z + A4.z);
    if (lv.light === 'external') {
      const c = s.rotC, sn = s.rotS;
      const nlx = c * s.lx - sn * s.ly, nly = sn * s.lx + c * s.ly;
      s.lx = nlx; s.ly = nly;
    }
    s.tick++;
    if (lv.light === 'stars') { checkRace(s); return; }
    // goal and failure are checked after every tick
    const r2 = s.x * s.x + s.y * s.y + s.z * s.z;
    const g = lv.goal, fl = lv.fail;
    if (r2 < fl.rMin * fl.rMin || r2 > fl.rMax * fl.rMax) { s.done = 'fail'; return; }
    if (r2 >= g.rMin * g.rMin && r2 <= g.rMax * g.rMax) {
      if (g.minInc === undefined) { s.done = 'success'; return; }
      const hx = s.y * s.vz - s.z * s.vy, hy = s.z * s.vx - s.x * s.vz, hz = s.x * s.vy - s.y * s.vx;
      const hn = Math.sqrt(hx * hx + hy * hy + hz * hz);
      // |cos i| <= cos(minInc): the orbit plane is at least minInc away from the reference plane
      if (Math.abs(hz) <= hn * T.cosDeg(g.minInc)) { s.done = 'success'; return; }
    }
    if (s.tick >= lv.maxTicks) s.done = 'timeout';
  }

  // race mode: open field. Too close to a star burns the sail; crossing the boundary sphere anywhere finishes the race.
  function checkRace(s) {
    const lv = s.level, st = lv.stars;
    for (let i = 0; i < st.length; i++) {
      const dx = s.x - st[i].pos[0], dy = s.y - st[i].pos[1], dz = s.z - st[i].pos[2];
      if (dx * dx + dy * dy + dz * dz < st[i].rMin * st[i].rMin) { s.done = 'fail'; return; }
    }
    const c = lv.goal.center, cx = s.x - c[0], cy = s.y - c[1], cz = s.z - c[2];
    if (cx * cx + cy * cy + cz * cz >= lv.goal.r * lv.goal.r) { s.done = 'success'; return; }
    if (s.tick >= lv.maxTicks) s.done = 'timeout';
  }

  // Run a whole replay. keys: [{t, a, b}] sorted by t.
  function runReplay(level, keys, schemeId, craftId) {
    const s = createState(level, schemeId, craftId), cur = { i: 0 };
    while (!s.done) {
      const k = controlAt(keys, s.tick, cur);
      step(s, k.a, k.b);
    }
    return { status: s.done, ticks: s.tick, time: s.tick * level.dt, keys: keys.length, state: s };
  }

  // the body the orbit is measured around: the origin, or in race mode the dominant star
  function refBody(s) { return s.level.light === 'stars' ? s.level.stars[dominant(s)].pos : [0, 0, 0]; }

  // the closest star in race mode (for the results), else the reference body
  function nearest(s) {
    const st = s.level.stars;
    if (!st) return refBody(s);
    let best = st[0].pos, bd = Infinity;
    for (let i = 0; i < st.length; i++) {
      const dx = s.x - st[i].pos[0], dy = s.y - st[i].pos[1], dz = s.z - st[i].pos[2], d = dx * dx + dy * dy + dz * dz;
      if (d < bd) { bd = d; best = st[i].pos; }
    }
    return best;
  }

  function inclinationDeg(s) {
    const hx = s.y * s.vz - s.z * s.vy, hy = s.z * s.vx - s.x * s.vz, hz = s.x * s.vy - s.y * s.vx;
    return Math.acos(hz / Math.sqrt(hx * hx + hy * hy + hz * hz)) * 180 / PI; // display only
  }

  const api = { createState, step, runReplay, controlAt, sailNormal, actualNormal, frame, dominant, refBody, nearest, inclinationDeg, flatLevel, flatten };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SailSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
