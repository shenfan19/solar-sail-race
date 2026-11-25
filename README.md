# Sail Race 谁谓河广

The Chinese name comes from the Book of Songs (詩經), *Wei Feng, He Guang*: 誰謂河廣？一葦杭之. Who says the river is wide? A single reed can cross it.

A non-real-time racing game about solar sails. Gravity pulls the sail toward the central body, light pushes it away, and the path between the two decides the score. Pausing and slowing down are free, so the race is about the trajectory, not about reflexes.

Status: first prototype, three missions.

Play online: https://shenfan19.github.io/solar-sail-race/

## Missions

| Mission | Light | Goal |
|---|---|---|
| Warm-up: spiral out to Mars | Sun, radial light, 1 AU start | Reach 1.52 AU |
| Solar polar orbit | Sun, radial light, 1 AU start | Orbit inclination at least 75 degrees |
| Earth polar orbit | Sun as external light that turns once a year, Earth shadow | Orbit inclination at least 80 degrees |

Each mission has a briefing, a pilot guide, a three-star rating from the finish time, and a results screen. Runs can be raced against the reference pilot, your own best, or a pasted replay code.

## Languages

English, 简体中文, 繁體中文, 日本語, 한국어, Français, Deutsch, Español, Русский. The game follows the browser language; the menu footer and Settings switch it. All interface text is in `js/locales`, one file per language.

## Controls

The sail is tilted with a pad: right leans it forward along the orbit, up leans it toward the orbit pole. The green dot on the pad is the guide.

| Device | Controls |
|---|---|
| Gamepad | Left stick tilt, right stick camera, triggers zoom, A or Start pause, X or D-pad right next view, Y guide, LB RB speed, Select split view, L3 center the pad |
| Keyboard | Arrows or WASD tilt, C center, Space pause, G guide, 1 to 5 views, V split, F follow, [ ] speed, R restart |
| Mouse | Drag on the pad to tilt, drag the scene to turn the camera, wheel to zoom |

The 3D view needs no library. Viewpoints: 3D, top, side, orbit plane, from the light.

## Control recording schemes

The pad can drive any control scheme in `js/controls.js`. A scheme only decides how a run is recorded and which two angle numbers are shown. Two schemes exist: Pitch / Yaw Euler angles (default) and Cone / Clock.

## Replays

Every run is stored as piecewise constant keyframes `{t, a, b}` for the chosen scheme. A replay code is the base64 of `{v: 2, level, control, assist, keys}`. Scores are computed by re-simulating the replay, never taken from the player.

## Run

Open `index.html` in a browser. No build step. Fonts load from Google Fonts when online and fall back to system fonts.

```
node tools/autopilot.js          # generate reference solutions
node tools/verify.js solutions/earth-polar_euler.json
```

Deep links: `index.html#level=earth-polar`, `#screen=settings`, `#lang=ja`, `#autoplay=1` flies the reference solution and shows the results screen.

## Determinism

`js/sim.js` uses only addition, subtraction, multiplication, division and square root, with the table sine and cosine of `js/trig.js`, so a replay gives the same result in every JavaScript engine.

## Citation

Citation metadata is in `CITATION.cff`.

## Acknowledgments

Jiafu Liu served as scientific advisor on solar sail dynamics.

This project was developed with AI coding assistance for code generation, automated testing, and documentation.

## License

MIT, see `LICENSE`.
