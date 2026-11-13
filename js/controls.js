// Control schemes. Each one maps two whole-degree numbers (a, b) to the sail normal written in the light frame:
//   l  = unit vector from the light source to the craft (central light: the radial direction)
//   e2 = reference north (central light: the orbit normal h)
//   e1 = e2 x l (central light: the transverse direction, forward along the orbit)
// so normal = e1 * out.e1 + e2 * out.e2 + l * out.l. The simulation core knows nothing else about a scheme,
// which keeps schemes interchangeable: add one here and it appears in the game, the replays and the tools.
//
// 'euler'      the original scheme of the research code: pitch and yaw Euler angles (order YXZ, yaw sign inverted),
//              identical to the sail orientation in the demo.
// 'cone-clock' cone angle from the light and clock angle around it, the usual solar sail mission design angles.
(function (root) {
  'use strict';
  const T = (typeof require === 'function' && typeof module !== 'undefined') ? require('./trig.js') : root.SailTrig;
  const RAD2DEG = 180 / T.PI;

  const euler = {
    id: 'euler',
    name: 'Pitch / Yaw (original)',
    a: { label: 'Pitch', min: -90, max: 90, start: 0 },
    b: { label: 'Yaw', min: -90, max: 90, start: 0 },
    // normal = Ry(-yaw) Rx(pitch) (0, 0, 1) expressed in the basis (e1, e2, l)
    local(a, b, out) {
      const cp = T.cosDeg(a), sp = T.sinDeg(a), cy = T.cosDeg(b), sy = T.sinDeg(b);
      out.e1 = -sy * cp; out.e2 = -sp; out.l = cy * cp;
    },
    // authoring side only (uses Math.asin, Math.atan2): turn a wanted normal into the nearest whole degrees
    fromLocal(n1, n2, n3) {
      return [Math.round(-Math.asin(Math.max(-1, Math.min(1, n2))) * RAD2DEG), Math.round(Math.atan2(-n1, n3) * RAD2DEG)];
    }
  };

  const coneClock = {
    id: 'cone-clock',
    name: 'Cone / Clock',
    a: { label: 'Cone', min: 0, max: 85, start: 0 },
    b: { label: 'Clock', min: -180, max: 180, start: 0 },
    local(a, b, out) {
      const ca = T.cosDeg(a), sa = T.sinDeg(a);
      out.e1 = sa * T.cosDeg(b); out.e2 = sa * T.sinDeg(b); out.l = ca;
    },
    fromLocal(n1, n2, n3) {
      return [Math.round(Math.acos(Math.max(-1, Math.min(1, n3))) * RAD2DEG), Math.round(Math.atan2(n2, n1) * RAD2DEG)];
    }
  };

  const registry = { 'euler': euler, 'cone-clock': coneClock };
  const order = ['euler', 'cone-clock'];

  function clamp(scheme, a, b) {
    a = Math.max(scheme.a.min, Math.min(scheme.a.max, Math.round(a)));
    b = Math.round(b);
    if (scheme.b.min === -180) { while (b > 180) b -= 360; while (b < -180) b += 360; }
    else b = Math.max(scheme.b.min, Math.min(scheme.b.max, b));
    return [a, b];
  }

  // Convert one control pair between schemes through the shared normal. Authoring side only.
  function convert(fromId, toId, a, b) {
    const o = {};
    registry[fromId].local(a, b, o);
    return registry[toId].fromLocal(o.e1, o.e2, o.l);
  }

  const api = { registry, order, clamp, convert };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SailControls = api;
})(typeof window !== 'undefined' ? window : globalThis);
