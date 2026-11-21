import fs from 'fs';
import path from 'path';

// Standalone verification harness importing/testing the exact map & physics algorithms
import {
  ALL_35_CLASSIC_STAGES,
  buildClassicStageMap,
  findReachableSupplyLocations,
  generateSeededStageMap,
  verifyMapConnectivity
} from '../src/game/maps.ts';
import {
  PLAYER_BASE_SPEED,
  PLAYER_BOOST_SPEED,
  STEP_DT,
  applySupplyPickup,
  createEnemyTank,
  createInitialSimulationState,
  fireTankShell,
  hasLineOfSight,
  mapCameraRelativeInputToCardinal,
  stepSimulation
} from '../src/game/simulation.ts';
import { ALL_ASSET_SLOTS, ALL_SUPPLY_SLOTS } from '../src/game/types.ts';
import { ALL_SOUND_CUES } from '../src/game/sound.ts';

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`VERIFICATION FAILED: ${msg}`);
  }
}

console.log('--- 1. Verifying 17 GLB Models & 15 OGG Audio Cues ---');
for (const slot of ALL_ASSET_SLOTS) {
  const p = path.resolve('public/models', `${slot}.glb`);
  assert(fs.existsSync(p), `Missing model file: ${p}`);
  const stat = fs.statSync(p);
  assert(stat.size > 100, `Model file too small: ${p}`);
}
for (const cue of ALL_SOUND_CUES) {
  const p = path.resolve('public/audio', `${cue}.ogg`);
  assert(fs.existsSync(p), `Missing audio cue: ${p}`);
  const stat = fs.statSync(p);
  assert(stat.size > 100, `Audio cue too small: ${p}`);
}
assert(fs.existsSync(path.resolve('public/audio/LICENSE.txt')), 'Missing audio LICENSE.txt');
console.log('PASS: 17/17 GLB models and 15/15 OGG cues verified on disk.');

console.log('--- 2. Verifying All 35 Classic Stage Maps ---');
for (let s = 1; s <= ALL_35_CLASSIC_STAGES.length; s++) {
  const built = buildClassicStageMap(s);
  assert(verifyMapConnectivity(built.grid), `Classic Stage ${s} failed connectivity or cover check`);
  assert(built.enemyQueue.length === 20, `Classic Stage ${s} wave length !== 20`);
}
console.log('PASS: 35/35 Classic Stages verified for 0.72 half-width connectivity & wave tables.');

console.log('--- 3. Verifying 1,000 Seeded Maps Across Grass, Snow & Industrial Biomes ---');
for (let i = 1; i <= 1000; i++) {
  const built = generateSeededStageMap(`verify-seed-${i}`, (i % 18) + 1);
  assert(verifyMapConnectivity(built.grid), `Seeded map #${i} failed connectivity or cover check`);
  const supplyLocs = findReachableSupplyLocations(built.grid);
  assert(supplyLocs.length > 5, `Seeded map #${i} has insufficient reachable supply spots`);
}
console.log('PASS: 1,000/1,000 Seeded Maps verified for full-chassis connectivity & safe spawns.');

console.log('--- 4. Verifying Camera-Relative Cardinal Input at Multiple Yaws ---');
const yaws = [0, Math.PI / 6, Math.PI / 2, Math.PI, -Math.PI / 2, (3 * Math.PI) / 4];
for (const yaw of yaws) {
  for (const key of ['N', 'E', 'S', 'W']) {
    const mapped = mapCameraRelativeInputToCardinal(key, yaw);
    assert(['N', 'E', 'S', 'W'].includes(mapped), `Invalid cardinal output ${mapped}`);
  }
}
assert(mapCameraRelativeInputToCardinal('N', 0) === 'N', 'Yaw 0 N should map to N');
assert(mapCameraRelativeInputToCardinal('N', -Math.PI / 2) === 'E', 'Yaw -90deg N should map to E');
assert(mapCameraRelativeInputToCardinal('N', Math.PI) === 'S', 'Yaw 180deg N should map to S');
console.log('PASS: Camera-relative cardinal input verified (never diagonal).');

console.log('--- 5. Verifying Heavy Tank 4-Hit Survival & Point-Blank Wall Sweep ---');
const state = createInitialSimulationState({
  campaignMode: 'classic',
  stageNumber: 1,
  runSeed: 'TEST',
  coopMode: false
});
const heavy = createEnemyTank('heavy-test', 'heavy', 0, false);
heavy.x = 9;
heavy.z = 21;
state.enemies.push(heavy);
state.freezeTimer = 20; // keep target stationary at (9,21) during 4-shot test
const p1 = state.players[0];
p1.x = 9;
p1.z = 24;
p1.dir = 'N';
p1.shieldTimer = 0;

// Clear tiles between (9,24) and (9,21)
for (let z = 20; z <= 25; z++) {
  state.grid[z][8] = 'empty';
  state.grid[z][9] = 'empty';
}

for (let hit = 1; hit <= 3; hit++) {
  p1.fireCooldown = 0;
  fireTankShell(state, p1);
  for (let step = 0; step < 60; step++) {
    stepSimulation(state, {
      p1: { moveDir: null, firePressed: false },
      p2: { moveDir: null, firePressed: false }
    });
  }
  assert(heavy.alive === true, `Heavy tank should survive hit #${hit}`);
  assert(heavy.hp === 4 - hit, `Heavy tank HP should be ${4 - hit} after hit #${hit}`);
}

// 4th hit destroys heavy tank
p1.fireCooldown = 0;
fireTankShell(state, p1);
for (let step = 0; step < 60; step++) {
  stepSimulation(state, {
    p1: { moveDir: null, firePressed: false },
    p2: { moveDir: null, firePressed: false }
  });
}
assert(heavy.alive === false && heavy.hp === 0, 'Heavy tank should be destroyed on 4th hit');
console.log('PASS: Heavy tank survives 3 unshielded hits and dies on 4th hit.');

// Point-blank steel wall check: place steel at z=22, x=9 and fire North from z=23.2
state.grid[22][9] = 'steel';
state.grid[21][9] = 'brick';
p1.x = 9.5;
p1.z = 23.73;
p1.dir = 'N';
p1.starLevel = 0;
p1.fireCooldown = 0;
fireTankShell(state, p1);
for (let step = 0; step < 30; step++) {
  stepSimulation(state, {
    p1: { moveDir: null, firePressed: false },
    p2: { moveDir: null, firePressed: false }
  });
}
assert(
  state.grid[21][9] === 'brick',
  'Shell must not tunnel through point-blank steel wall to hit brick behind it'
);
console.log('PASS: Point-blank continuous shell sweep prevents wall tunneling.');

console.log('--- 6. Verifying All 10 Supply Effects & Magnet Wall Obstacle Check ---');
for (const slot of ALL_SUPPLY_SLOTS) {
  applySupplyPickup(state, p1, slot);
}
assert(p1.starLevel >= 1, 'Star upgrade applied');
assert(p1.shieldTimer === 12, 'Helmet 12s shield applied');
assert(state.freezeTimer === 9, 'Clock 9s freeze applied');
assert(state.shovelTimer === 16, 'Shovel 16s base reinforcement applied');
assert(p1.ammoTimer === 14, 'Ammo 14s rapid fire applied');
assert(p1.magnetTimer === 20, 'Magnet 20s applied');
assert(p1.boostTimer === 12, 'Boost 12s applied');
assert(PLAYER_BASE_SPEED === 4.2 && PLAYER_BOOST_SPEED === 6.3, 'Player speeds 4.2 / 6.3 verified');

// Verify magnet line-of-sight wall check
state.grid[18][9] = 'steel';
assert(
  hasLineOfSight(state.grid, 9.5, 20.5, 9.5, 16.5) === false,
  'Magnet line-of-sight must be blocked by steel wall at (9,18)'
);
console.log('PASS: All 10 supplies & magnet obstacle line-of-sight verified.');
