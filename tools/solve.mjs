// Brute-force each level to make sure it is beatable, and print the best
// placements found. node tools/solve.mjs [levelIndex]
import { World, WON } from '../src/physics.js';
import { LEVELS } from '../src/levels.js';

const DT = 1 / 60;

function run(level, magnets) {
  const w = new World(level);
  for (const m of magnets) {
    const ok = w.place(m.x, m.z, m.q);
    if (!ok) return null;
  }
  w.reset();
  while (w.state === 'alive') w.step(DT);
  return { state: w.state, time: w.time };
}

function grid(level, step) {
  const pts = [];
  const [W, D] = level.size;
  for (let x = -W / 2 + 1; x <= W / 2 - 1; x += step)
    for (let z = -D / 2 + 1; z <= D / 2 - 1; z += step)
      pts.push([x, z]);
  return pts;
}

function solve(level) {
  const results = [];
  const zero = run(level, []);
  console.log(`\n## ${level.name}: no magnets -> ${zero.state} at ${zero.time.toFixed(2)}s`);
  const pts = grid(level, 1);
  // one magnet
  for (const [x, z] of pts) for (const q of [1, -1]) {
    const r = run(level, [{ x, z, q }]);
    if (r && r.state === WON) results.push({ n: 1, time: r.time, magnets: [{ x, z, q }] });
  }
  // two magnets, coarser
  if (results.length < 3 || level.budget >= 2) {
    const pts2 = grid(level, 2.5);
    for (let i = 0; i < pts2.length; i++) for (let j = i + 1; j < pts2.length; j++)
      for (const q1 of [1, -1]) for (const q2 of [1, -1]) {
        const ms = [{ x: pts2[i][0], z: pts2[i][1], q: q1 }, { x: pts2[j][0], z: pts2[j][1], q: q2 }];
        const r = run(level, ms);
        if (r && r.state === WON) results.push({ n: 2, time: r.time, magnets: ms });
      }
  }
  results.sort((a, b) => a.n - b.n || a.time - b.time);
  const ones = results.filter(r => r.n === 1).length, twos = results.filter(r => r.n === 2).length;
  console.log(`wins: ${ones} with one magnet, ${twos} with two (of ${pts.length * 2} and pair grid)`);
  for (const r of results.slice(0, 5)) console.log(`  ${r.n} magnet(s), ${r.time.toFixed(2)}s:`, JSON.stringify(r.magnets));
  return results;
}

const which = process.argv[2];
const targets = which === undefined ? LEVELS : [LEVELS[+which]];
for (const l of targets) solve(l);
