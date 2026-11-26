// Guidance and the tilt pad mapping. Authoring and interface side only, not part of the deterministic core.
//
// The tilt pad is a unit disk. A point (px, py) on it is a sail normal written in the light frame:
//   n1 = px * sin(padCone), n2 = py * sin(padCone), n3 = sqrt(1 - n1^2 - n2^2)
// so right on the pad leans the sail forward along the orbit (e1), up on the pad leans it toward the reference
// north or orbit normal (e2), and the edge of the disk is a cone angle of padCone degrees. Any control scheme
// can be driven from the pad through scheme.fromLocal, so the pad works with every scheme.
(function (root) {
  'use strict';
  const isNode = typeof require === 'function' && typeof module !== 'undefined';
  const Sim = isNode ? require('./sim.js') : root.SailSim;
  const DEG = Math.PI / 180;
  const MAX_CONE = 80;

  function padToLocal(px, py, padCone) {
    const k = Math.sin(padCone * DEG);
    const n1 = px * k, n2 = py * k;
    return [n1, n2, Math.sqrt(Math.max(0, 1 - n1 * n1 - n2 * n2))];
  }
  function localToPad(n1, n2, padCone) {
    const k = Math.sin(padCone * DEG);
    return [n1 / k, n2 / k];
  }

  // Cone angle that pushes the craft best toward a direction at angle theta from the light, for this craft.
  // film: push along n with size cos^2(cone), so the gain is cos^2(a) cos(theta - a)
  // tethers: push (u + cos(a) n) / 2, so the gain is (cos(theta) + cos(a) cos(theta - a)) / 2
  // A hybrid weighs the two by its beta and kappa.
  function bestCone(craft, theta) {
    const wp = craft.beta, we = craft.kappa;
    let best = 0, bestF = -Infinity;
    for (let a = 0; a <= MAX_CONE; a++) {
      const r = a * DEG, ca = Math.cos(r), cd = Math.cos(theta - r);
      const f = wp * ca * ca * cd + we * 0.5 * (Math.cos(theta) + ca * cd);
      if (f > bestF) { bestF = f; best = a; }
    }
    return best;
  }

  // The sail normal a good pilot would choose now, in the light frame [n1, n2, n3].
  // law 'spiral': lean forward along the orbit, which raises the orbit.
  // law 'incline': thrust along plus or minus the orbit normal, switching sign at the orbit nodes, which raises the
  //                inclination fastest.
  // law 'escape': race mode, reach the boundary of the star field as soon as possible.
  // The cone for spiral and incline is the hull's best cone for a push square to the light.
  function wanted(s, opt) {
    const w = wantedFinal(s, opt);
    if (!s.level.flat) return reachable(s, w);
    const o = { e1: w[0], e2: w[1], l: w[2] };
    Sim.flatten(o);
    return [o.e1, 0, o.l];
  }

  // With a slow mechanism the sail turns along the shortest path, and a large change of clock angle would sweep the
  // sail through the sun-facing attitude, where the full push lies in the orbit plane. A pilot instead swings the lean
  // around at a steady cone. So when the wanted lean is far round the clock from the real one, the guide shows a
  // point on the way that the mechanism can reach in about GUIDE_TICKS ticks.
  const GUIDE_TICKS = 10;
  function reachable(s, w) {
    if (!s.chord) return w;
    const cNow = Math.acos(Math.max(-1, Math.min(1, s.n3))), cWant = Math.acos(Math.max(-1, Math.min(1, w[2])));
    if (cNow < 10 * DEG || cWant < 10 * DEG) return w;
    const pNow = Math.atan2(s.n2, s.n1), pWant = Math.atan2(w[1], w[0]);
    let dp = pWant - pNow;
    while (dp > Math.PI) dp -= 2 * Math.PI;
    while (dp < -Math.PI) dp += 2 * Math.PI;
    if (Math.abs(dp) < 30 * DEG) return w;
    // a half turn can go either way round: go through the forward lean, which also raises the orbit
    if (Math.abs(dp) > 150 * DEG && Math.cos(pNow + dp / 2) < 0) dp -= Math.sign(dp) * 2 * Math.PI;
    const move = s.craft.turnPerUnit * s.level.dt * GUIDE_TICKS * DEG / Math.sin(cWant);
    const p = pNow + Math.sign(dp) * Math.min(Math.abs(dp), move);
    return [Math.sin(cWant) * Math.cos(p), Math.sin(cWant) * Math.sin(p), Math.cos(cWant)];
  }

  function wantedFinal(s, opt) {
    const cone = opt.tryCone || (s.craft ? s.craft.optCone : opt.cone);
    const sa = Math.sin(cone * DEG), ca = Math.cos(cone * DEG);
    if (opt.law === 'spiral') return [sa, 0, ca];
    const F = Sim.frame(s, {});
    if (opt.law === 'escape') return toward(s, F, escapeDirection(s, opt));
    const h = orbitNormal(s);
    let nx = -h[1], ny = h[0]; // node direction = z x h
    const nn = Math.hypot(nx, ny);
    if (nn < 1e-6) { nx = 1; ny = 0; } else { nx /= nn; ny /= nn; }
    const sign = (s.x * nx + s.y * ny) >= 0 ? 1 : -1;
    const d = [sign * h[0], sign * h[1], sign * h[2]];
    const dl = d[0] * F.lx + d[1] * F.ly + d[2] * F.lz;
    const ex = d[0] - dl * F.lx, ey = d[1] - dl * F.ly, ez = d[2] - dl * F.lz;
    const c1 = ex * F.e1x + ey * F.e1y + ez * F.e1z;
    const c2 = ex * F.e2x + ey * F.e2y + ez * F.e2z;
    const m = Math.hypot(c1, c2) || 1;
    return [sa * c1 / m, sa * c2 / m, ca];
  }

  // race guide: the direction the craft should be pushed now.
  // A sail is strong only close to a star and cannot push toward a light, while gravity pulls toward every star for
  // free. So the guide asks for the acceleration that would turn the velocity outward within lv.guideLag time units,
  // subtracts what gravity already gives, and lets the sail supply the rest as well as it can.
  // Outward is the heading opt.heading (degrees in the field plane) when given, else away from the field centre.
  // A star ahead whose overheating sphere the path would cross, counting the bending by its gravity, takes over: the guide then pushes
  // sideways off that line and away from the star, which lifts the closest approach.
  function escapeDirection(s, opt) {
    const lv = s.level, c = lv.goal.center, speed = Math.max(lv.guideSpeed, Math.hypot(s.vx, s.vy, s.vz)), lag = lv.guideLag;
    let ux, uy, uz;
    if (opt.heading !== undefined) { ux = Math.cos(opt.heading * DEG); uy = Math.sin(opt.heading * DEG); uz = 0; }
    else {
      ux = s.x - c[0]; uy = s.y - c[1]; uz = s.z - c[2];
      let m = Math.hypot(ux, uy, uz);
      if (m < 0.3) { ux = s.vx; uy = s.vy; uz = s.vz; m = Math.hypot(ux, uy, uz); }
      if (m < 1e-9) { ux = 1; uy = 0; uz = 0; m = 1; }
      ux /= m; uy /= m; uz /= m;
    }
    const v = Math.hypot(s.vx, s.vy, s.vz) || 1e-9;
    let worst = null, worstK = 0;
    lv.stars.forEach((st) => {
      const px = st.pos[0] - s.x, py = st.pos[1] - s.y, pz = st.pos[2] - s.z, d = Math.hypot(px, py, pz);
      const along = (px * s.vx + py * s.vy + pz * s.vz) / v;
      if (along <= 0) return;
      const time = along / v;
      if (time > lag * 2) return;
      const qx = px - along * s.vx / v, qy = py - along * s.vy / v, qz = pz - along * s.vz / v, miss = Math.hypot(qx, qy, qz);
      // gravity bends the path inward: a straight line missing by less than rMin * sqrt(1 + vesc^2 / v^2) hits
      const safe = 1.5 * st.rMin * Math.sqrt(1 + 2 * lv.mu * st.mass / (st.rMin * v * v)) + 0.2;
      if (miss > safe) return;
      const k = (safe - miss) / safe / (1 + time / lag);
      if (k > worstK) { worstK = k; worst = [qx, qy, qz, miss, px / d, py / d, pz / d]; }
    });
    let ax, ay, az;
    if (worst) {
      // push sideways off the line to the star, and partly straight away from it, which a wind sail can always do
      let wx = -worst[0], wy = -worst[1], wz = -worst[2], wm = worst[3];
      if (wm < 1e-6) { wx = uy; wy = -ux; wz = 0; wm = Math.hypot(wx, wy) || 1; }
      return [wx / wm - worst[4], wy / wm - worst[5], wz / wm - worst[6]];
    }
    ax = (ux * speed - s.vx) / lag; ay = (uy * speed - s.vy) / lag; az = (uz * speed - s.vz) / lag;
    lv.stars.forEach((st) => {
      const px = s.x - st.pos[0], py = s.y - st.pos[1], pz = s.z - st.pos[2], r = Math.hypot(px, py, pz);
      const k = lv.mu * st.mass / (r * r * r);
      ax += k * px; ay += k * py; az += k * pz;
    });
    return [ax, ay, az];
  }

  // normal in the light frame that pushes best along world direction d
  function toward(s, F, d) {
    const dn = Math.hypot(d[0], d[1], d[2]) || 1;
    const d1 = (d[0] * F.e1x + d[1] * F.e1y + d[2] * F.e1z) / dn;
    const d2 = (d[0] * F.e2x + d[1] * F.e2y + d[2] * F.e2z) / dn;
    const d3 = (d[0] * F.lx + d[1] * F.ly + d[2] * F.lz) / dn;
    const theta = Math.acos(Math.max(-1, Math.min(1, d3)));
    const a = bestCone(s.craft, theta) * DEG;
    const m = Math.hypot(d1, d2);
    const c1 = m < 1e-9 ? 1 : d1 / m, c2 = m < 1e-9 ? 0 : d2 / m;
    return [Math.sin(a) * c1, Math.sin(a) * c2, Math.cos(a)];
  }

  // orbit normal around the reference body (the origin, or the dominant star in race mode)
  function orbitNormal(s) {
    const o = Sim.refBody(s), x = s.x - o[0], y = s.y - o[1], z = s.z - o[2];
    const hx = y * s.vz - z * s.vy, hy = z * s.vx - x * s.vz, hz = x * s.vy - y * s.vx;
    const n = Math.hypot(hx, hy, hz) || 1;
    return [hx / n, hy / n, hz / n];
  }

  // direction of the line of nodes, where the orbit crosses the reference plane
  function nodeDirection(s) {
    const h = orbitNormal(s);
    let nx = -h[1], ny = h[0];
    const nn = Math.hypot(nx, ny);
    if (nn < 1e-6) return [1, 0, 0];
    return [nx / nn, ny / nn, 0];
  }

  const api = { padToLocal, localToPad, wanted, bestCone, orbitNormal, nodeDirection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SailGuide = api;
})(typeof window !== 'undefined' ? window : globalThis);
