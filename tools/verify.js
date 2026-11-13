// Server side score check: re-simulates a replay code (base64) or a replay json file and prints the verified score.
// Replay format v2: {v: 2, level, control, keys: [{t, a, b}]}
// usage: node tools/verify.js <base64 code | path to json>
'use strict';
const fs = require('fs');
const Sim = require('../js/sim.js');
const Controls = require('../js/controls.js');
const levels = require('../js/levels.js');
const arg = process.argv[2];
if (!arg) { console.error('usage: node tools/verify.js <replay code or json file>'); process.exit(2); }
const text = fs.existsSync(arg) ? fs.readFileSync(arg, 'utf8') : Buffer.from(arg, 'base64').toString('utf8');
const o = JSON.parse(text);
const lv = levels.find((l) => l.id === o.level);
const scheme = Controls.registry[o.control];
if (o.v !== 2 || !lv || !scheme || !Array.isArray(o.keys)) { console.error('invalid replay'); process.exit(1); }
const keys = o.keys.map((k) => {
  const [a, b] = Controls.clamp(scheme, k.a | 0, k.b | 0);
  return { t: Math.max(0, k.t | 0), a, b };
}).sort((x, y) => x.t - y.t);
const r = Sim.runReplay(lv, keys, o.control);
console.log(JSON.stringify({ level: lv.id, control: o.control, status: r.status, time: r.time, unit: lv.timeScaleLabel, controlChanges: r.keys }));
process.exit(r.status === 'success' ? 0 : 1);
