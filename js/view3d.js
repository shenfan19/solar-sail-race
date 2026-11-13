// Small dependency free 3D drawing on a 2D canvas: orbit camera, perspective projection, preset viewpoints,
// several viewports on one canvas. Drawing only; nothing here touches the simulation.
(function (root) {
  'use strict';
  const D2R = Math.PI / 180;

  const PRESETS = [
    { id: 'iso', name: '3D', key: '1', az: -60, el: 28, follow: false },
    { id: 'top', name: 'Top', key: '2', az: -90, el: 90, follow: false },
    { id: 'side', name: 'Side', key: '3', az: -90, el: 0, follow: false },
    { id: 'plane', name: 'Orbit plane', key: '4', dynamic: true, follow: false },
    { id: 'light', name: 'From the light', key: '5', dynamic: true, follow: true }
  ];

  const LAYOUTS = {
    one: [[0, 0, 1, 1]],
    two: [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]],
    three: [[0, 0, 2 / 3, 1], [2 / 3, 0, 1 / 3, 0.5], [2 / 3, 0.5, 1 / 3, 0.5]]
  };

  function makeViewport(presetId) {
    const vp = { rect: { x: 0, y: 0, w: 1, h: 1 }, mode: 'iso', az: -60, el: 28, zoom: 1, follow: false };
    applyPreset(vp, presetId);
    return vp;
  }

  function applyPreset(vp, presetId) {
    const p = PRESETS.find((q) => q.id === presetId) || PRESETS[0];
    vp.mode = p.id; vp.follow = p.follow;
    if (!p.dynamic) { vp.az = p.az; vp.el = p.el; }
  }

  // Dynamic presets follow the simulation: the orbit plane view looks along the orbit normal,
  // the light view sits on the light source side and looks at the craft.
  function updateDynamic(vp, h, l) {
    let d = null;
    if (vp.mode === 'plane') d = h; else if (vp.mode === 'light') d = [-l[0], -l[1], -l[2]];
    if (!d) return;
    vp.el = Math.asin(Math.max(-1, Math.min(1, d[2]))) / D2R;
    vp.az = Math.atan2(d[1], d[0]) / D2R;
  }

  function prep(vp, span, target) {
    const az = vp.az * D2R, el = vp.el * D2R, ce = Math.cos(el), se = Math.sin(el);
    vp.cam = {
      r: [-Math.sin(az), Math.cos(az), 0],
      u: [-se * Math.cos(az), -se * Math.sin(az), ce],
      c: [ce * Math.cos(az), ce * Math.sin(az), se],
      t: target, D: 4 * span / vp.zoom,
      scale: Math.min(vp.rect.w, vp.rect.h) / (2 * span / vp.zoom)
    };
  }

  // returns [screenX, screenY, perspective factor] or null when behind the camera
  function project(vp, p) {
    const c = vp.cam, dx = p[0] - c.t[0], dy = p[1] - c.t[1], dz = p[2] - c.t[2];
    const sx = dx * c.r[0] + dy * c.r[1] + dz * c.r[2];
    const sy = dx * c.u[0] + dy * c.u[1] + dz * c.u[2];
    const w = dx * c.c[0] + dy * c.c[1] + dz * c.c[2];
    const den = c.D - w;
    if (den < 0.1 * c.D) return null;
    const f = c.D / den;
    return [vp.rect.x + vp.rect.w / 2 + sx * f * c.scale, vp.rect.y + vp.rect.h / 2 - sy * f * c.scale, f];
  }

  function polyline(ctx, vp, pts, color, width, dash) {
    if (pts.length < 2) return;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath();
    let pen = false;
    for (let i = 0; i < pts.length; i++) {
      const q = project(vp, pts[i]);
      if (!q) { pen = false; continue; }
      if (pen) ctx.lineTo(q[0], q[1]); else { ctx.moveTo(q[0], q[1]); pen = true; }
    }
    ctx.stroke(); ctx.setLineDash([]);
  }

  function segment(ctx, vp, a, b, color, width) { polyline(ctx, vp, [a, b], color, width); }

  function disc(ctx, vp, p, worldRadius, color, minPx) {
    const q = project(vp, p);
    if (!q) return;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(q[0], q[1], Math.max(minPx || 2, worldRadius * vp.cam.scale * q[2]), 0, 6.2832); ctx.fill();
  }

  // circle of given radius around `center`, spanned by unit vectors e1 and e2
  function circlePoints(center, radius, e1, e2, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const a = i / n * 6.283185307179586, c = Math.cos(a) * radius, s = Math.sin(a) * radius;
      pts.push([center[0] + c * e1[0] + s * e2[0], center[1] + c * e1[1] + s * e2[1], center[2] + c * e1[2] + s * e2[2]]);
    }
    return pts;
  }

  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  function norm(a) { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; }
  function add(a, b, k) { return [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k]; }

  root.SailView = { PRESETS, LAYOUTS, makeViewport, applyPreset, updateDynamic, prep, project, polyline, segment, disc, circlePoints, cross, norm, add };
})(typeof window !== 'undefined' ? window : globalThis);
