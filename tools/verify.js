// Server side score check: re-simulates a replay code (base64) or a replay json file and prints the verified score.
// Replay format v3: {v: 3, level, control, craft, flat?, keys: [{t, a, b}]}. flat: 1 means the run was locked to 2D.
// v2 replays (before crafts) fly the ideal craft.
// usage: node tools/verify.js <base64 code | path to json>
'use strict';
const fs = require('fs');
const Sim = require('../js/sim.js');
const Controls = require('../js/controls.js');
const levels = require('../js/levels.js');
const Crafts = require('../js/crafts.js');
const arg = process.argv[2];
if (!arg) { console.error('usage: node tools/verify.js <replay code or json file>'); process.exit(2); }
const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : Buffer.from(arg, 'base64').toString('utf8');
const o = JSON.parse(text);
const base = levels.find((l) => l.id === o.level);
const lv = base && o.flat ? (base.allow2D ? Sim.flatLevel(base) : null) : base;
const scheme = Controls.registry[o.control];
const craft = o.v === 2 ? 'photon:ideal' : o.craft;
if ((o.v !== 2 && o.v !== 3) || !lv || !scheme || !Array.isArray(o.keys) || (o.v === 3 && Crafts.problem(craft, lv))) { console.error('invalid replay'); process.exit(1); }
const keys = o.keys.map((k) => {
  const [a, b] = Controls.clamp(scheme, k.a | 0, k.b | 0);
  return { t: Math.max(0, k.t | 0), a, b };
}).sort((x, y) => x.t - y.t);
const r = Sim.runReplay(lv, keys, o.control, craft);
console.log(JSON.stringify({ level: lv.id, flat: !!lv.flat, control: o.control, craft: craft, status: r.status, time: r.time, unit: lv.timeScaleLabel, controlChanges: r.keys }));
process.exit(r.status === 'success' ? 0 : 1);
