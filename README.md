# Solar Sail Race 谁谓河广

By Fan Shen and Jiafu Liu.

- Fan Shen 沈凡, School of Systems Science and Engineering, Sun Yat-sen University, shenfan19@gmail.com
- Jiafu Liu 刘家夫, School of Aeronautics and Astronautics, Sun Yat-sen University (Shenzhen Campus), liujf53@mail.sysu.edu.cn

The Chinese name comes from the Book of Songs (詩經), *Wei Feng, He Guang*: 誰謂河廣？一葦杭之. Who says the river is wide? A single reed can cross it.

A non-real-time racing game about solar sails and electric sails. Gravity pulls the craft toward a star or planet, light or the stellar wind pushes it away, and the path between the two decides the score. Pausing and slowing down are free, so the race is about the trajectory, not about reflexes.

Status: prototype, three missions and three star fields.

Play online: https://shenfan19.github.io/solar-sail-race/

Changes by version: [CHANGELOG.md](CHANGELOG.md), also shown in the game under About.

## Modes

- Missions: real parameters, one central body.
- Star race: fiction on purpose. A field of fixed stars about ten thousand times denser than the real neighbourhood of the Sun. Gravity, light pressure and the stellar wind keep their real laws and strengths, so pull and push grow together. Start in the middle of the field and cross the boundary sphere anywhere; the shortest time wins. The field is a flattened disc, as the Galaxy is a thin disc, so the race is in three dimensions.

## Missions

| Mission | Light | Goal |
|---|---|---|
| Warm-up: spiral out to Mars | Sun, radial light, 1 AU start | Reach 1.52 AU |
| Solar polar orbit | Sun, radial light, 1 AU start | Orbit inclination at least 75 degrees |
| Earth polar orbit | Sun as external light that turns once a year, Earth shadow | Orbit inclination at least 80 degrees |

| Star field | Stars | Boundary | Start |
|---|---|---|---|
| Near field | 24, mostly red dwarfs, one A star | 11 AU | drifting |
| Young cluster | 40, with three A stars, five F stars and six Sun-like stars | 15 AU | drifting |
| Deep field | 60, mostly dim | 17 AU | at rest |

Star types (`js/levels.js`): M, K, G, F and A, each with a mass, luminosity and wind strength. Light against gravity scales as luminosity over mass, so a red dwarf barely pushes a film sail while an A star pushes it away harder than it pulls. The ring around each star where the film would overheat is 0.2 AU around a Sun-like star scaled by the square root of the luminosity, and at least 0.1 AU. Fields are generated from a seed with integer arithmetic, so the layout is identical in every browser.

The warm-up mission and the star races can be flown with Lock 2D, switched on in the briefing. The sail then only leans forward and back, so the flight never leaves its plane. A star field flown in 2D has its own flat layout (`seed2D`), medal times, records and reference ghost. The polar orbit missions need to leave the plane and have no 2D lock.

Pause stops only the clock: the camera still turns and zooms and the sail can be set while paused. Leaving the page does not pause.

Each mission and star field has a briefing, a pilot guide, a three-star rating from the finish time, and a results screen. Runs can be raced against the reference pilot, your own best, or a pasted replay code.

## Crafts

The hangar, opened from the briefing, combines a sail with one or more attitude control mechanisms. Data in `js/crafts.js`, force laws in `js/sim.js`.

| Sail | Force law |
|---|---|
| Solar sail | Ideal flat reflector, push along the sail normal, size cos² of the angle to the light, fades as 1/r² |
| Electric sail | Charged tethers in the spin plane feel the wind component across them; push (u + (u·n) n) / 2, fades as 1/r, tilts at most about 18 degrees from the wind; not available inside the Earth's magnetosphere |
| Hybrid sail | Both on one frame, star race only |

| Mechanism | Sail |
|---|---|
| Gimbaled boom, tip vanes, sliding mass, reflectivity control | Solar sail, hybrid |
| Tether voltage, tip thruster units | Electric sail, hybrid |

Each mechanism limits how fast the real sail normal follows the pad and adds mass, which weakens every push. Combined mechanisms add their turn rates and their masses. Turn rates and masses are game settings ranked by how fast each mechanism turns a real sail, not mission data. When a mechanism lags, a dashed ring on the pad shows where the sail really points.

## Languages

English, 简体中文, 日本語. The game follows the browser language; any Chinese browser gets Simplified Chinese, other languages get English; the menu footer and Settings switch it. All interface text is in `js/locales`, one file per language.

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

Every run is stored as piecewise constant keyframes `{t, a, b}` for the chosen scheme. A replay code is the base64 of `{v: 3, level, control, craft, assist, flat, keys}`; `craft` is an id such as `photon:vane+mass`, and `flat: 1` marks a run flown with Lock 2D. Codes of format v2, recorded before crafts existed, replay with instant turning. Scores are computed by re-simulating the replay, never taken from the player.

## Run

Open `index.html` in a browser. No build step. Fonts load from Google Fonts when online and fall back to system fonts.

```
node tools/autopilot.js          # generate reference solutions with the default craft, 3D and Lock 2D
node tools/autopilot.js --survey # fly every craft on every mission and star field
node tools/verify.js solutions/earth-polar_euler.json
```

Deep links: `index.html#level=earth-polar`, `#mode=race`, `#screen=settings`, `#screen=garage`, `#lang=ja`, `#flat=1` turns on Lock 2D, `#autoplay=1` flies the reference solution and shows the results screen.

## Determinism

`js/sim.js` uses only addition, subtraction, multiplication, division and square root, with the table sine and cosine of `js/trig.js`, so a replay gives the same result in every JavaScript engine.

## Citation

Citation metadata is in `CITATION.cff`.

## Acknowledgments

This project was developed with AI coding assistance for code generation, automated testing, and documentation.

## License

MIT, see `LICENSE`.
