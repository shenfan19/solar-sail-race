// Deterministic sine and cosine. Only + - * / and floor are used, all exactly specified by IEEE 754,
// so results are bit-identical in every JavaScript engine (Math.sin and Math.cos are not guaranteed to be).
(function (root) {
  'use strict';
  const PI = 3.141592653589793;
  const TWO_PI = 6.283185307179586;

  function sinRad(x) {
    x = x - TWO_PI * Math.floor((x + PI) / TWO_PI); // reduce to [-pi, pi)
    let term = x, sum = x;
    const x2 = x * x;
    for (let n = 1; n < 22; n++) {
      term = -term * x2 / ((2 * n) * (2 * n + 1));
      sum += term;
    }
    return sum;
  }
  function cosRad(x) { return sinRad(x + PI / 2); }

  // Control angles are whole degrees, so tables cover them.
  const SIN = new Array(360), COS = new Array(360);
  for (let d = 0; d < 360; d++) {
    SIN[d] = sinRad(d * PI / 180);
    COS[d] = cosRad(d * PI / 180);
  }
  function idx(deg) { return ((deg % 360) + 360) % 360; }
  function sinDeg(d) { return SIN[idx(d)]; }
  function cosDeg(d) { return COS[idx(d)]; }

  const api = { PI, sinRad, cosRad, sinDeg, cosDeg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SailTrig = api;
})(typeof window !== 'undefined' ? window : globalThis);
