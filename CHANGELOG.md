# Changelog

The same entries, in every interface language, are shown in the game under About.

## 0.4.0 · 2026-11-25

- Pause stops only the clock. The scene stays in view, the camera still turns and zooms, and the sail can be set while paused. Leaving the page no longer pauses. Restart and menu buttons sit in the flight bar.
- Lock 2D, in the briefing of the warm-up mission and the star races: the sail only leans forward and back, so the flight never leaves the plane. Flat star fields have their own layout, medal times, records and reference ghost. Replay codes mark such runs with `flat: 1`.
- Changelog, author affiliations and emails in About, README and CITATION.cff.

## 0.3.0 · 2026-11-25

- Two modes: missions with real parameters, and a star race that is fiction on purpose.
- Star race: open fields of 24, 40 and 60 fixed stars in a flattened disc. Start in the middle and cross the boundary sphere anywhere. Gravity, light and stellar wind keep their real laws and strengths.
- Hangar: solar, electric and hybrid sails, and six attitude mechanisms that can be combined. How fast the sail turns is part of the simulation.
- Replay codes record the craft (format v3); older codes still play.
- Fixed: racing a pasted replay code failed.

## 0.2.0 · 2026-11-25

- Named Solar Sail Race 谁谓河广, with Jiafu Liu as co-author.
- Nine languages, following the browser; front page introduction; About page; quieter colours.
- Phone layout: the menu fits one screen; version shown in the footer and About.

## 0.1.0 · 2026-11-13

- Deterministic sail simulation: a replay re-simulates bit-identically in every browser and in the verify tool.
- Three missions: spiral out to Mars, solar polar orbit, Earth polar orbit.
- Two control schemes, a tilt pad with a pilot guide, 3D views with presets and split view, gamepad support.
