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

describe('aging', () => {
  it('typical batters peak near age 30 before declining in their 30s', () => {
    const rng = constantRng(0.55);
    const player = createBatter();
    ensurePlayerAgingProfile(player, { rng });

    expect(player.aging.profile).toBe('standard');
    expect(player.aging.peakAge).toBeGreaterThanOrEqual(28);
    expect(player.aging.peakAge).toBeLessThanOrEqual(32);

    const initialCon = player.con;
    advanceYears(player, 2, rng);
    expect(player.age).toBeGreaterThanOrEqual(28);
    expect(player.con).toBeGreaterThanOrEqual(initialCon - 0.5);

    const preDeclineCon = player.con;
    advanceYears(player, 6, rng);
    expect(player.age).toBeGreaterThanOrEqual(34);
    expect(player.con).toBeLessThan(preDeclineCon);
    expect(preDeclineCon - player.con).toBeGreaterThanOrEqual(3);
  });

  it('pitcher peak windows adjust based on assigned profile', () => {
    const earlyRng = constantRng(0.02);
    const lateRng = constantRng(0.98);

    const earlyPitcher = createPitcher();
    const latePitcher = createPitcher({ id: 'late' });

    ensurePlayerAgingProfile(earlyPitcher, { rng: earlyRng });
    ensurePlayerAgingProfile(latePitcher, { rng: lateRng });

    expect(earlyPitcher.aging.profile).toBe('early');
    expect(latePitcher.aging.profile).toBe('late');
    expect(earlyPitcher.aging.peakAge).toBeLessThan(latePitcher.aging.peakAge);
    expect(earlyPitcher.aging.peakAge).toBeLessThanOrEqual(28);
    expect(latePitcher.aging.peakAge).toBeGreaterThanOrEqual(30);
  });

  it('injury history accelerates aging decline into the late 30s', () => {
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

    expect(healthy.age).toBeGreaterThanOrEqual(38);
    expect(injured.age).toBeGreaterThanOrEqual(38);
    expect(healthy.con).toBeGreaterThan(injured.con);
    expect(healthy.con).toBeGreaterThanOrEqual(40);
    expect(healthy.con - injured.con).toBeGreaterThanOrEqual(4);
  });

  it('aging decline should result in integer ability scores', () => {
    const rng = constantRng(0.5);
    const player = createBatter({ age: 32 });
    ensurePlayerAgingProfile(player, { rng });

    // Advance the player past their peak to ensure decline occurs
    advanceYears(player, 5, rng);

    // Check that all relevant ability scores are integers
    expect(Number.isInteger(player.con)).toBe(true);
    expect(Number.isInteger(player.pwr)).toBe(true);
    expect(Number.isInteger(player.spd)).toBe(true);
    expect(Number.isInteger(player.fld)).toBe(true);
    expect(Number.isInteger(player.pot)).toBe(true);
  });
});
