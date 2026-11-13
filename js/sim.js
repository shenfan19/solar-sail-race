// Deterministic solar sail simulation core.
// Uses only + - * / and sqrt (all exactly specified by IEEE 754) plus the table trig of trig.js,
// so a replay gives bit-identical results in every browser and in Node.
// The control scheme (how two whole-degree numbers become a sail normal) is a plug-in, see controls.js.
// Works as a classic script (window.SailSim) and as a CommonJS module.
(function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const T = isNode ? require('./trig.js') : root.SailTrig;
  const C = isNode ? require('./controls.js') : root.SailControls;
  const PI = T.PI;

  // ---- control track: piecewise constant keyframes {t, a, b}, t in ticks, a and b in whole degrees ----
  function controlAt(keys, tick, cursor) {
    while (cursor.i + 1 < keys.length && keys[cursor.i + 1].t <= tick) cursor.i++;
    return keys.length ? keys[cursor.i] : { t: 0, a: 0, b: 0 };
  }

  function createState(level, schemeId) {
    const scheme = C.registry[schemeId || C.order[0]];
    const s = {
      level, scheme, tick: 0,
      x: level.start.pos[0], y: level.start.pos[1], z: level.start.pos[2],
      vx: level.start.vel[0], vy: level.start.vel[1], vz: level.start.vel[2],
      // direction light travels (source to craft); only used when the light is external to the central body
      lx: 1, ly: 0, lz: 0,
      rotC: 1, rotS: 0, // per tick rotation of the light direction
      done: null
    };
    if (level.light === 'external') {
      const w = level.lightRate * level.dt; // rad per tick
      s.rotC = T.cosRad(w); s.rotS = T.sinRad(w);
      s.lx = level.lightStart[0]; s.ly = level.lightStart[1]; s.lz = 0;
    }
    return s;
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
    } else {
      lx = s.lx; ly = s.ly; lz = s.lz; e2x = 0; e2y = 0; e2z = 1;
    }
    // e1 = e2 x l
    let e1x = e2y * lz - e2z * ly, e1y = e2z * lx - e2x * lz, e1z = e2x * ly - e2y * lx;
    const en = Math.sqrt(e1x * e1x + e1y * e1y + e1z * e1z) || 1;
    e1x /= en; e1y /= en; e1z /= en;
    out.lx = lx; out.ly = ly; out.lz = lz;
    out.e1x = e1x; out.e1y = e1y; out.e1z = e1z;
    out.e2x = e2x; out.e2y = e2y; out.e2z = e2z;
    return out;
  }

  const F = {}, LOC = {};
  function sailNormal(s, a, b, out) {
    frame(s, F);
    s.scheme.local(a, b, LOC);
    out.x = LOC.l * F.lx + LOC.e1 * F.e1x + LOC.e2 * F.e2x;
    out.y = LOC.l * F.ly + LOC.e1 * F.e1y + LOC.e2 * F.e2y;
    out.z = LOC.l * F.lz + LOC.e1 * F.e1z + LOC.e2 * F.e2z;
    return out;
  }

  function accel(lv, px, py, pz, nx, ny, nz, lx, ly, lz, out) {
    const r2 = px * px + py * py + pz * pz;
    const r = Math.sqrt(r2);
    const g = lv.mu / (r2 * r);
    let ax = -g * px, ay = -g * py, az = -g * pz;
    let lightX = lx, lightY = ly, lightZ = lz;
    if (lv.light === 'central') { lightX = px / r; lightY = py / r; lightZ = pz / r; }
    const cl = nx * lightX + ny * lightY + nz * lightZ;
    if (cl > 0 && lv.beta > 0) {
      let mag;
      if (lv.light === 'central') mag = lv.beta * lv.mu / r2 * cl * cl;
      else {
        mag = lv.sailAccel * cl * cl;
        // cylindrical shadow behind the planet
        const along = px * lx + py * ly + pz * lz;
        if (along > 0) {
          const qx = px - along * lx, qy = py - along * ly, qz = pz - along * lz;
          if (qx * qx + qy * qy + qz * qz < lv.bodyRadius * lv.bodyRadius) mag = 0;
        }
      }
      ax += mag * nx; ay += mag * ny; az += mag * nz;
    }
    out.x = ax; out.y = ay; out.z = az;
  }

  const N = {}, A1 = {}, A2 = {}, A3 = {}, A4 = {};
  function step(s, a, b) {
    const lv = s.level, dt = lv.dt;
    sailNormal(s, a, b, N);
    const nx = N.x, ny = N.y, nz = N.z;
    const lx = s.lx, ly = s.ly, lz = s.lz;
    const x = s.x, y = s.y, z = s.z, vx = s.vx, vy = s.vy, vz = s.vz;
    accel(lv, x, y, z, nx, ny, nz, lx, ly, lz, A1);
    const h = dt * 0.5;
    const x2 = x + h * vx, y2 = y + h * vy, z2 = z + h * vz;
    const v2x = vx + h * A1.x, v2y = vy + h * A1.y, v2z = vz + h * A1.z;
    accel(lv, x2, y2, z2, nx, ny, nz, lx, ly, lz, A2);
    const x3 = x + h * v2x, y3 = y + h * v2y, z3 = z + h * v2z;
    const v3x = vx + h * A2.x, v3y = vy + h * A2.y, v3z = vz + h * A2.z;
    accel(lv, x3, y3, z3, nx, ny, nz, lx, ly, lz, A3);
    const x4 = x + dt * v3x, y4 = y + dt * v3y, z4 = z + dt * v3z;
    const v4x = vx + dt * A3.x, v4y = vy + dt * A3.y, v4z = vz + dt * A3.z;
    accel(lv, x4, y4, z4, nx, ny, nz, lx, ly, lz, A4);
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

  // Run a whole replay. keys: [{t, a, b}] sorted by t.
  function runReplay(level, keys, schemeId) {
    const s = createState(level, schemeId), cur = { i: 0 };
    while (!s.done) {
      const k = controlAt(keys, s.tick, cur);
      step(s, k.a, k.b);
    }
    return { status: s.done, ticks: s.tick, time: s.tick * level.dt, keys: keys.length, state: s };
  }

  function inclinationDeg(s) {
    const hx = s.y * s.vz - s.z * s.vy, hy = s.z * s.vx - s.x * s.vz, hz = s.x * s.vy - s.y * s.vx;
    return Math.acos(hz / Math.sqrt(hx * hx + hy * hy + hz * hz)) * 180 / PI; // display only
  }

  const api = { createState, step, runReplay, controlAt, sailNormal, frame, inclinationDeg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SailSim = api;
})(typeof window !== 'undefined' ? window : globalThis);
