// Level definitions. All numbers are data; the simulation core contains none.
// Heliocentric levels: length AU, time day, mu in AU^3/day^2, sail acceleration = beta * mu / r^2 * cos^2(cone).
// view.rate: simulated time units per real second at speed 1x.
// Planet levels: length Earth radius, time hour, mu in R^3/h^2, sail acceleration is constant (light is far away).
(function (root) {
  'use strict';
  const levels = [
    {
      id: 'sun-mars',
      name: 'Warm-up: spiral out to Mars',
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
      brief: {
        goal: 'Spiral out to the orbit of Mars, 1.52 AU from the Sun.',
        steps: [
          'Sunlight pushes the sail along the red arrow.',
          'Lean the sail forward along the orbit to gain speed and climb to a higher orbit.',
          'Follow the green dot on the tilt pad. The fastest time wins.'
        ]
      },
      hints: {
        first: 'Drag the pad, push the stick or press the arrow keys to tilt the sail.',
        steps: [
          { p: 0, text: 'Lean the sail forward, pad to the right, to climb.' },
          { p: 0.6, text: 'Keep leaning. Mars is getting close.' }
        ]
      },
      view: { span: 1.8, rate: 4 }
    },
    {
      id: 'sun-polar',
      name: 'Solar polar orbit',
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
      brief: {
        goal: 'Tilt your orbit around the Sun by 75 degrees or more.',
        steps: [
          'Light can push the sail out of its orbit plane as well as along it.',
          'Lean up while you are on the right of the Sun and down while you are on the left. Every half orbit tilts the plane a little more.',
          'The pink line marks where your orbit crosses the flat plane. Switch the lean when you cross it. The green dot shows the best lean.'
        ]
      },
      hints: {
        first: 'Drag the pad, push the stick or press the arrow keys to tilt the sail.',
        steps: [
          { p: 0, text: 'Lean up on one side of the Sun, down on the other. Switch at the pink line.' },
          { p: 0.5, text: 'Halfway there. Keep switching at the pink line.' },
          { p: 0.85, text: 'Almost polar!' }
        ]
      },
      view: { span: 1.6, rate: 10 }
    },
    {
      id: 'earth-polar',
      name: 'Earth polar orbit',
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
      brief: {
        goal: 'Tilt your orbit around the Earth by 80 degrees or more.',
        steps: [
          'Sunlight comes from one side and slowly turns around the sky.',
          'The Earth casts a shadow, and inside it the sail gets no push.',
          'Switch the lean when you cross the pink line. The green dot shows the best lean.'
        ]
      },
      hints: {
        first: 'Drag the pad, push the stick or press the arrow keys to tilt the sail.',
        steps: [
          { p: 0, text: 'Switch the lean each time you cross the pink line.' },
          { p: 0.5, text: 'Halfway there. The Sun keeps turning, so keep following the green dot.' },
          { p: 0.85, text: 'Almost polar!' }
        ]
      },
      view: { span: 16, rate: 8 }
    }
  ];
  if (typeof module !== 'undefined' && module.exports) module.exports = levels; else root.SailLevels = levels;
})(typeof window !== 'undefined' ? window : globalThis);
