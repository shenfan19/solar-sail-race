// Level definitions. All numbers are data; the simulation core contains none.
// Player-facing text (name, goal, briefing steps, hints) is in js/locales under lv.<id>.*; hintAt gives the goal progress
// at which each entry of lv.<id>.hints takes over.
// Heliocentric levels: length AU, time day, mu in AU^3/day^2, sail acceleration = beta * mu / r^2 * cos^2(cone).
// view.rate: simulated time units per real second at speed 1x.
// allow2D: the player may lock the flight to the start plane. Not for the polar orbit missions, which need to leave it.
// Planet levels: length Earth radius, time hour, mu in R^3/h^2, sail acceleration is constant (light is far away).
(function (root) {
  'use strict';
  const levels = [
    {
      id: 'sun-mars', mode: 'sim', hoursPerUnit: 24, au: 1, solarWind: true, allow2D: true,
      story: 'Start on a circular orbit at 1 AU. Use the push of light to gain orbital energy and spiral outward until you cross the orbit of Mars at 1.52 AU. Pushing forward along the orbit raises the orbit, pushing backward lowers it.',
      light: 'central',
      mu: 0.000295912208,
      beta: 0.3,
      dt: 0.5,
      unitLen: 'AU', unitTime: 'day', timeScaleLabel: 'days',
      start: { pos: [1, 0, 0], vel: [0, 0.017202098950, 0] },
      goal: { rMin: 1.52, rMax: 2.4, label: 'distance 1.52 AU' },
      fail: { rMin: 0.2, rMax: 2.5 },
      maxTicks: 20000,
      autopilot: { law: 'spiral', cone: 35 },
      difficulty: 'Easy',
      medals: { gold: 130, silver: 165, bronze: 230 },
      hintAt: [0, 0.6],
      view: { span: 1.8, rate: 4 }
    },
    {
      id: 'sun-polar', mode: 'sim', hoursPerUnit: 24, au: 1, solarWind: true,
      story: 'Start on a circular orbit at 1 AU in the ecliptic. Tilt the orbit plane to at least 75 degrees so the sail sees the Sun\'s poles. Light always comes from the Sun, so steer the sail with the cone and clock angles.',
      light: 'central',
      mu: 0.000295912208,
      beta: 0.3,
      dt: 0.5,
      unitLen: 'AU', unitTime: 'day', timeScaleLabel: 'days',
      start: { pos: [1, 0, 0], vel: [0, 0.017202098950, 0] },
      goal: { minInc: 75, rMin: 0.2, rMax: 1.3 },
      fail: { rMin: 0.1, rMax: 2.5 },
      maxTicks: 20000,
      autopilot: { law: 'incline', cone: 35 },
      difficulty: 'Medium',
      medals: { gold: 1500, silver: 1900, bronze: 2600 },
      hintAt: [0, 0.5, 0.85],
      view: { span: 1.6, rate: 10 }
    },
    {
      id: 'earth-polar', mode: 'sim', hoursPerUnit: 1, solarWind: false, // inside the magnetosphere: no solar wind
      story: 'The sail starts on a circular orbit around the Earth, radius 7 Earth radii, in the plane of the ecliptic. The Sun drifts around the sky, and the Earth casts a shadow. Tilt the orbit to at least 80 degrees without falling into the atmosphere or escaping.',
      light: 'external',
      lightStart: [1, 0],
      lightRate: 0.0000398, // rad per hour: one turn per year
      bodyRadius: 1,
      mu: 19.9,
      beta: 0.3,
      sailAccel: 0.003615, // R_E/h^2: lightness 0.3 at 1 AU, 0.3 x 5.93 mm/s^2 x 3600^2 / 6.378e6 m
      dt: 0.1,
      unitLen: 'R_E', unitTime: 'h', timeScaleLabel: 'hours',
      start: { pos: [7, 0, 0], vel: [0, 1.686548, 0] },
      goal: { minInc: 80, rMin: 2, rMax: 14 },
      fail: { rMin: 1.2, rMax: 20 },
      maxTicks: 200000,
      autopilot: { law: 'incline', cone: 35 },
      difficulty: 'Hard',
      medals: { gold: 860, silver: 1100, bronze: 1500 },
      hintAt: [0, 0.5, 0.85],
      view: { span: 16, rate: 8 }
    },

    // ---- race mode: fiction on purpose ----
    // A field of fixed stars about ten thousand times denser than the real neighbourhood of the Sun (a few AU between
    // stars instead of light years). Gravity, light pressure and the wind keep their real laws and their real
    // strengths, so pull and push grow together. The race is open: start in the middle, cross the boundary sphere
    // anywhere, shortest time wins. The field is a flattened disc, as the Galaxy is a thin disc.
    // Stars are made by field() below from a seed, so the layout is data and the same in every browser.
    {
      id: 'race-near', mode: 'race', hoursPerUnit: 24, au: 1, solarWind: true, allow2D: true,
      light: 'stars',
      mu: 0.000295912208,
      dt: 0.2,
      unitLen: 'AU', unitTime: 'day', timeScaleLabel: 'days',
      field: { seed: 7, seed2D: 6, counts: { M: 16, K: 4, G: 2, F: 1, A: 1 }, radius: 9, thick: 0.15, minSep: 1.5, clear: 1.2 },
      start: { pos: [0, 0, 0], vel: [0.008, 0, 0] },
      goal: { center: [0, 0, 0], r: 11 },
      maxTicks: 25000,
      autopilot: { law: 'escape' },
      guideSpeed: 0.04, guideLag: 60,
      difficulty: 'Easy',
      medals: { gold: 600, silver: 680, bronze: 820 }, medals2D: { gold: 715, silver: 810, bronze: 980 },
      hintAt: [0, 0.5],
      view: { span: 12, rate: 20 }
    },
    {
      id: 'race-young', mode: 'race', hoursPerUnit: 24, au: 1, solarWind: true, allow2D: true,
      light: 'stars',
      mu: 0.000295912208,
      dt: 0.2,
      unitLen: 'AU', unitTime: 'day', timeScaleLabel: 'days',
      field: { seed: 5, seed2D: 9, counts: { M: 18, K: 8, G: 6, F: 5, A: 3 }, radius: 12, thick: 0.15, minSep: 1.5, clear: 1.2 },
      start: { pos: [0, 0, 0], vel: [0, 0.008, 0] },
      goal: { center: [0, 0, 0], r: 15 },
      maxTicks: 25000,
      autopilot: { law: 'escape' },
      guideSpeed: 0.04, guideLag: 60,
      difficulty: 'Medium',
      medals: { gold: 495, silver: 560, bronze: 680 }, medals2D: { gold: 850, silver: 960, bronze: 1160 },
      hintAt: [0, 0.5],
      view: { span: 16, rate: 25 }
    },
    {
      id: 'race-deep', mode: 'race', hoursPerUnit: 24, au: 1, solarWind: true, allow2D: true,
      light: 'stars',
      mu: 0.000295912208,
      dt: 0.2,
      unitLen: 'AU', unitTime: 'day', timeScaleLabel: 'days',
      field: { seed: 6, seed2D: 8, counts: { M: 40, K: 10, G: 5, F: 3, A: 2 }, radius: 14, thick: 0.15, minSep: 1.5, clear: 1.2 },
      start: { pos: [0, 0, 0], vel: [0, 0, 0] },
      goal: { center: [0, 0, 0], r: 17 },
      maxTicks: 30000,
      autopilot: { law: 'escape' },
      guideSpeed: 0.04, guideLag: 60,
      difficulty: 'Hard',
      medals: { gold: 1360, silver: 1550, bronze: 1900 }, medals2D: { gold: 1470, silver: 1670, bronze: 2060 },
      hintAt: [0, 0.5],
      view: { span: 18, rate: 30 }
    }
  ];

  // Star types: mass in solar masses, lum in solar luminosities, wind relative to the solar wind at the same distance.
  // Light against gravity scales as lum / mass, so a red dwarf barely pushes a film sail and an A star pushes it away
  // harder than it pulls. rMin is where the film would overheat, 0.2 AU around a Sun-like star scaled by sqrt(lum),
  // and never below 0.1 AU (the star itself and its flares); it applies to every craft so the rules stay the same.
  const starTypes = {
    M: { mass: 0.3, lum: 0.03, wind: 0.6 },
    K: { mass: 0.7, lum: 0.3, wind: 0.8 },
    G: { mass: 1, lum: 1, wind: 1 },
    F: { mass: 1.3, lum: 3, wind: 0.7 },
    A: { mass: 2, lum: 20, wind: 0.3 }
  };
  // Deterministic star field: integer hash random numbers, uniform in a disc of the given radius and half thickness
  // radius * thick, at least minSep apart, none within clear of the start.
  function field(f, start) {
    let seed = f.seed >>> 0;
    const rnd = () => {
      seed = (seed + 0x6D2B79F5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const out = [], h = f.radius * f.thick;
    Object.keys(f.counts).forEach((type) => {
      for (let n = 0; n < f.counts[type]; n++) {
        for (let tries = 0; tries < 5000; tries++) {
          const x = (rnd() * 2 - 1) * f.radius, y = (rnd() * 2 - 1) * f.radius, z = (rnd() * 2 - 1) * h;
          if (x * x + y * y > f.radius * f.radius) continue;
          const sx = x - start[0], sy = y - start[1], sz = z - start[2];
          if (sx * sx + sy * sy + sz * sz < f.clear * f.clear) continue;
          if (out.some((o) => { const dx = o.pos[0] - x, dy = o.pos[1] - y, dz = o.pos[2] - z; return dx * dx + dy * dy + dz * dz < f.minSep * f.minSep; })) continue;
          const T = starTypes[type];
          out.push({ pos: [x, y, z], mass: T.mass, lum: T.lum, wind: T.wind, rMin: Math.max(0.1, 0.2 * Math.sqrt(T.lum)), type: type });
          break;
        }
      }
    });
    return out;
  }
  // allow2D: the level can be flown locked to its plane (see sim.js flatLevel). A star field then has its own flat
  // layout, made by the same generator with no thickness from seed2D; medals2D are its medal times.
  levels.forEach((lv) => {
    if (!lv.field) return;
    lv.stars = field(lv.field, lv.start.pos);
    if (lv.allow2D) lv.stars2D = field(Object.assign({}, lv.field, { seed: lv.field.seed2D, thick: 0 }), lv.start.pos);
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = levels; else root.SailLevels = levels;
})(typeof window !== 'undefined' ? window : globalThis);
