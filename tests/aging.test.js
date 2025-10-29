import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ensurePlayerAgingProfile,
  progressPlayerAging
} from '../src/systems/aging.js';

function constantRng(value) {
  return () => value;
}

function createBatter(overrides = {}) {
  return {
    id: 'bat-' + (overrides.id || 'test'),
    name: overrides.name || 'Test Batter',
    age: overrides.age ?? 26,
    con: overrides.con ?? 72,
    disc: overrides.disc ?? 68,
    pwr: overrides.pwr ?? 74,
    spd: overrides.spd ?? 70,
    fld: overrides.fld ?? 69,
    pot: overrides.pot ?? 80,
    traits: [],
    injury: null,
    ...overrides
  };
}

function createPitcher(overrides = {}) {
  return {
    id: 'pit-' + (overrides.id || 'test'),
    name: overrides.name || 'Test Pitcher',
    age: overrides.age ?? 25,
    velo: overrides.velo ?? 74,
    ctrl: overrides.ctrl ?? 71,
    mov: overrides.mov ?? 73,
    stam: overrides.stam ?? 70,
    pot: overrides.pot ?? 82,
    traits: [],
    injury: null,
    role: overrides.role || 'SP',
    ...overrides
  };
}

function advanceYears(player, years, rng) {
  const totalDays = Math.round(years * 365);
  let remaining = totalDays;
  while (remaining > 0) {
    const chunk = Math.min(90, remaining);
    progressPlayerAging(player, chunk, { rng });
    remaining -= chunk;
  }
}

test('typical batters peak near age 30 before declining in their 30s', () => {
  const rng = constantRng(0.55);
  const player = createBatter();
  ensurePlayerAgingProfile(player, { rng });

  assert.equal(player.aging.profile, 'standard');
  assert.ok(player.aging.peakAge >= 28 && player.aging.peakAge <= 32, `peakAge=${player.aging.peakAge}`);

  const initialCon = player.con;
  advanceYears(player, 2, rng);
  assert.ok(player.age >= 28);
  assert.ok(player.con >= initialCon - 0.5, `early decline detected: ${player.con} vs ${initialCon}`);

  const preDeclineCon = player.con;
  advanceYears(player, 6, rng);
  assert.ok(player.age >= 34);
  assert.ok(player.con < preDeclineCon, 'batter should decline after peak');
  assert.ok(preDeclineCon - player.con >= 3, `decline too small: ${preDeclineCon} -> ${player.con}`);
});

test('pitcher peak windows adjust based on assigned profile', () => {
  const earlyRng = constantRng(0.02);
  const lateRng = constantRng(0.98);

  const earlyPitcher = createPitcher();
  const latePitcher = createPitcher({ id: 'late' });

  ensurePlayerAgingProfile(earlyPitcher, { rng: earlyRng });
  ensurePlayerAgingProfile(latePitcher, { rng: lateRng });

  assert.equal(earlyPitcher.aging.profile, 'early');
  assert.equal(latePitcher.aging.profile, 'late');
  assert.ok(earlyPitcher.aging.peakAge < latePitcher.aging.peakAge, 'late profile should peak later');
  assert.ok(earlyPitcher.aging.peakAge <= 28);
  assert.ok(latePitcher.aging.peakAge >= 30);
});

test('injury history accelerates aging decline into the late 30s', () => {
  const rng = constantRng(0.6);
  const healthy = createBatter({ id: 'healthy' });
  const injured = createBatter({ id: 'injured' });

  ensurePlayerAgingProfile(healthy, { rng });
  ensurePlayerAgingProfile(injured, { rng });

  injured.injury = { id: 'fx', name: 'Fracture', duration: 90 };
  advanceYears(injured, 0.25, rng);
  injured.injury = null;

  advanceYears(healthy, 12, rng);
  advanceYears(injured, 12, rng);

  assert.ok(healthy.age >= 38 && injured.age >= 38);
  assert.ok(healthy.con > injured.con, 'injury history should lead to lower ability');
  assert.ok(healthy.con >= 40, 'decline should remain gradual for healthy players');
  assert.ok(healthy.con - injured.con >= 4, `gap too small: healthy ${healthy.con} vs injured ${injured.con}`);
});

test('aging decline should result in integer ability scores', () => {
  const rng = constantRng(0.5);
  const player = createBatter({ age: 32 });
  ensurePlayerAgingProfile(player, { rng });

  // Advance the player past their peak to ensure decline occurs
  advanceYears(player, 5, rng);

  // Check that all relevant ability scores are integers
  assert.ok(Number.isInteger(player.con), `contact is not an integer: ${player.con}`);
  assert.ok(Number.isInteger(player.pwr), `power is not an integer: ${player.pwr}`);
  assert.ok(Number.isInteger(player.spd), `speed is not an integer: ${player.spd}`);
  assert.ok(Number.isInteger(player.fld), `fielding is not an integer: ${player.fld}`);
  assert.ok(Number.isInteger(player.pot), `potential is not an integer: ${player.pot}`);
});
