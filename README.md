# Sail Race

A non-real-time racing game about solar sails. Gravity pulls the sail toward the central body, light pushes it away, and the path between the two decides the score. Pausing and time warp are free, so the race is about the trajectory, not about reflexes.

Status: first prototype, three levels, two interchangeable control schemes.

## Levels

| Level | Central light | Goal |
|---|---|---|
| Warm-up: spiral out to Mars | Sun, radial light, 1 AU start | Reach 1.52 AU |
| Solar polar orbit | Sun, radial light, 1 AU start | Orbit inclination at least 75 degrees |
| Earth polar orbit | Sun as external light that turns once a year, Earth shadow | Orbit inclination at least 80 degrees |

## Controls

The sail normal is set by two whole-degree angles. Two schemes are available, selected in the page, and more can be added in `js/controls.js`.

- Pitch / Yaw: Euler angles measured from the light direction. 0 and 0 faces the light.
- Cone / Clock: cone is the angle between the sail normal and the light, 0 to 85. Clock is the direction the normal leans toward around the light axis, 0 along the orbit, 90 toward the orbit normal.

Arrow keys change the angles, Shift for 5 degrees, Space pauses.

## Views

The 3D view needs no library. Layouts of one, two or three views; click a view to select it, drag to rotate, wheel to zoom. Keys 1 to 5 jump the selected view to 3D, top, side, orbit plane or the light side. F follows the sail, V cycles the layout, [ and ] change the speed. Deep link example: `index.html#level=earth-polar&control=cone-clock&layout=one`.

## Replays

Every run is stored as piecewise constant keyframes `{t, a, b}` for the chosen control scheme. A replay code is the base64 of `{v: 2, level, control, keys}`. Scores are computed by re-simulating the replay, never taken from the player.

## Run

Open `index.html` in a browser. No build step.

```
node tools/autopilot.js          # generate reference solutions
node tools/verify.js solutions/earth-polar_euler.json
```

## Determinism

`js/sim.js` uses only addition, subtraction, multiplication, division and square root, with the table sine and cosine of `js/trig.js`, so a replay gives the same result in every JavaScript engine.

## License

MIT
