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

  function padToLocal(px, py, padCone) {
    const k = Math.sin(padCone * DEG);
    const n1 = px * k, n2 = py * k;
    return [n1, n2, Math.sqrt(Math.max(0, 1 - n1 * n1 - n2 * n2))];
  }
  function localToPad(n1, n2, padCone) {
    const k = Math.sin(padCone * DEG);
    return [n1 / k, n2 / k];
  }

  // The sail normal a good pilot would choose now, in the light frame [n1, n2, n3].
  // law 'spiral': lean forward along the orbit, which raises the orbit.
  // law 'incline': thrust along plus or minus the orbit normal, switching sign at the orbit nodes, which raises the
  //                inclination fastest.
  function wanted(s, opt) {
    const sa = Math.sin(opt.cone * DEG), ca = Math.cos(opt.cone * DEG);
    if (opt.law === 'spiral') return [sa, 0, ca];
    const F = Sim.frame(s, {});
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

  function orbitNormal(s) {
    const hx = s.y * s.vz - s.z * s.vy, hy = s.z * s.vx - s.x * s.vz, hz = s.x * s.vy - s.y * s.vx;
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

  const api = { padToLocal, localToPad, wanted, orbitNormal, nodeDirection };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SailGuide = api;
})(typeof window !== 'undefined' ? window : globalThis);
