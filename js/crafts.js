// Craft data: sail types (hulls) and attitude control mechanisms. All numbers are data; sim.js reads them through derive().
// A craft id is '<hull>:<mech>+<mech>...', for example 'photon:vane+mass'. Replays store the id, so a replay is
// re-simulated with the same craft.
//
// Hull physics, written into sim.js:
//   photon    ideal flat reflector: a = beta * mu_sun * L / r^2 * (u.n)|u.n| * n
//   electric  charged tethers in the spin plane; each tether feels the wind component perpendicular to it, and the
//             average over tethers in the plane gives a = kappa * mu_sun * W / (r * r0) * (u + (u.n) n) / 2.
//             The thrust can therefore tilt at most about 18 degrees away from the wind, and is halved when the
//             spin plane contains the wind. r0 is 1 AU in level units.
//   hybrid    film and tethers on one frame, both laws added (fictional, race mode only)
// beta: lightness number at a Sun-like star. kappa: electric sail acceleration at 1 AU divided by the solar gravity
// there (1 mm/s^2 / 5.93 mm/s^2 = 0.17, the characteristic acceleration usually quoted for electric sail designs).
//
// Mechanisms limit how fast the sail normal can turn (degrees per hour) and add mass, which divides the acceleration
// by (1 + mass). Combined mechanisms add their turn rates and their masses. The rates are game settings ordered by
// how fast each mechanism turns a real sail, not mission data.
(function (root) {
  'use strict';

  const hulls = {
    photon: { beta: 0.3, kappa: 0, optCone: 35, modes: ['sim', 'race'], wind: false, mechs: ['gimbal', 'vane', 'mass', 'rcd'] },
    electric: { beta: 0, kappa: 0.17, optCone: 45, modes: ['sim', 'race'], wind: true, mechs: ['voltage', 'remote'] },
    hybrid: { beta: 0.2, kappa: 0.11, optCone: 40, modes: ['race'], wind: true, mechs: ['gimbal', 'vane', 'mass', 'rcd', 'voltage', 'remote'] }
  };
  const hullOrder = ['photon', 'electric', 'hybrid'];

  const mechs = {
    gimbal: { rate: 20, mass: 0.10 },   // gimbaled boom moving the payload against the sail
    vane: { rate: 10, mass: 0.05 },     // control vanes at the sail tips
    mass: { rate: 5, mass: 0.03 },      // sliding mass on the booms
    rcd: { rate: 1.5, mass: 0.01 },     // reflectivity control devices, flown on IKAROS
    voltage: { rate: 1, mass: 0 },      // per-tether voltage modulation over the spin
    remote: { rate: 4, mass: 0.08 },    // small thruster units at the tether tips
    ideal: { rate: 0, mass: 0, hidden: true } // instant turning; replays made before mechanisms existed
  };

  const defaults = { sim: 'photon:vane', race: 'photon:vane' };

  function parse(id) {
    const p = String(id || '').split(':');
    const hull = hulls[p[0]] ? p[0] : null;
    const list = (p[1] || '').split('+').filter((m) => mechs[m]);
    return { hull: hull, mechs: list };
  }
  function idOf(hull, list) { return hull + ':' + list.join('+'); }

  // is this craft allowed in this level; returns null when fine, or the reason key
  function problem(id, level) {
    const c = parse(id);
    if (!c.hull || !c.mechs.length) return 'bad';
    const h = hulls[c.hull];
    if (h.modes.indexOf(level.mode || 'sim') < 0) return 'mode';
    if (h.wind && !level.solarWind) return 'noWind';
    for (const m of c.mechs) if (m !== 'ideal' && h.mechs.indexOf(m) < 0) return 'bad';
    return null;
  }

  // physical parameters of a craft in a level: effective beta, kappa, turn rate in degrees per level time unit
  function derive(id, level) {
    const c = parse(id);
    const h = hulls[c.hull] || hulls.photon;
    let rate = 0, mass = 0, instant = false;
    c.mechs.forEach((m) => { if (m === 'ideal') instant = true; rate += mechs[m].rate; mass += mechs[m].mass; });
    const k = 1 / (1 + mass);
    return {
      id: id, hull: c.hull, mechs: c.mechs,
      beta: h.beta * k, kappa: h.kappa * k, optCone: h.optCone,
      turnPerUnit: instant ? 0 : rate * level.hoursPerUnit, // 0 means instant
      ratePerHour: instant ? 0 : rate, mass: mass
    };
  }

  const api = { hulls, hullOrder, mechs, defaults, parse, idOf, problem, derive };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.SailCrafts = api;
})(typeof window !== 'undefined' ? window : globalThis);
