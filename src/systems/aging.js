const DAYS_PER_YEAR = 365;
const MIN_RATING = 20;

const PROFILE_WEIGHTS = {
  batter: [
    { id: 'early', weight: 0.25 },
    { id: 'standard', weight: 0.52 },
    { id: 'late', weight: 0.23 }
  ],
  pitcher: [
    { id: 'early', weight: 0.38 },
    { id: 'standard', weight: 0.42 },
    { id: 'late', weight: 0.20 }
  ]
};

const PROFILE_TUNING = {
  early: { basePeak: 27, jitter: 1.2, declineMult: 1.12 },
  standard: { basePeak: 30, jitter: 1.0, declineMult: 1.0 },
  late: { basePeak: 33, jitter: 1.4, declineMult: 0.88 }
};

const ROLE_TUNING = {
  batter: { peakShift: 0, declineMult: 1.0 },
  pitcher: { peakShift: -1.2, declineMult: 1.12 }
};

const BATTING_KEYS = ['con', 'disc', 'pwr', 'spd', 'fld', 'eye', 'def', 'gap', 'contact', 'power', 'discipline'];
const PITCHING_KEYS = ['velo', 'ctrl', 'mov', 'stam', 'cmd', 'stuff', 'control', 'movement', 'velocity', 'stamina'];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function resolveRng(rng) {
  return typeof rng === 'function' ? rng : Math.random;
}

function isPitcher(player) {
  if (!player || typeof player !== 'object') return false;
  if (player.role) {
    const role = String(player.role).toUpperCase();
    if (role.includes('P')) return true;
  }
  return Number.isFinite(player?.velo) || Number.isFinite(player?.ctrl) || Number.isFinite(player?.mov);
}

function chooseProfile(player, rng, preferredProfile) {
  if (preferredProfile && PROFILE_TUNING[preferredProfile]) {
    return preferredProfile;
  }
  const pitcher = isPitcher(player);
  const table = pitcher ? PROFILE_WEIGHTS.pitcher : PROFILE_WEIGHTS.batter;
  const roll = rng();
  let acc = 0;
  for (const entry of table) {
    acc += entry.weight;
    if (roll < acc) return entry.id;
  }
  return table[table.length - 1].id;
}

function resolvePeakAge(player, profile, rng, explicitPeakAge) {
  if (Number.isFinite(explicitPeakAge)) return explicitPeakAge;
  const tuning = PROFILE_TUNING[profile] || PROFILE_TUNING.standard;
  const role = isPitcher(player) ? ROLE_TUNING.pitcher : ROLE_TUNING.batter;
  const jitterRoll = rng();
  const jitter = (jitterRoll - 0.5) * 2 * tuning.jitter;
  const peak = tuning.basePeak + (role?.peakShift || 0) + jitter;
  const baseAge = Number.isFinite(player?.age) ? player.age : 24;
  return clamp(Math.round(peak * 10) / 10, Math.max(22, baseAge - 2), 40);
}

function ensureAgingState(player, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const rng = resolveRng(options.rng);
  const aging = player.aging && typeof player.aging === 'object' ? player.aging : {};
  if (!aging.initialized) {
    const profile = chooseProfile(player, rng, options.profile || aging.profile);
    aging.profile = profile;
    aging.peakAge = resolvePeakAge(player, profile, rng, options.peakAge || aging.peakAge);
    aging.ageDays = Number.isFinite(aging.ageDays) ? aging.ageDays : 0;
    aging.injuryDays = Number.isFinite(aging.injuryDays) ? aging.injuryDays : 0;
    aging.lastUpdatedDay = options.day ?? null;
    aging.initialized = true;
  } else {
    if (options.profile && PROFILE_TUNING[options.profile]) {
      aging.profile = options.profile;
    }
    if (Number.isFinite(options.peakAge)) {
      aging.peakAge = options.peakAge;
    }
  }
  player.aging = aging;
  return aging;
}

function getAbilityKeys(player) {
  const keys = [];
  const list = isPitcher(player) ? PITCHING_KEYS : BATTING_KEYS;
  list.forEach(key => {
    if (Number.isFinite(player?.[key])) keys.push(key);
  });
  return keys;
}

function updateInjuryHistory(player, aging, days) {
  const injury = player?.injury;
  if (!aging) return;
  if (injury && injury.duration != null && injury.duration > 0) {
    const key = injury.id || injury.code || injury.type || injury.name || 'injury';
    if (!aging.activeInjury || aging.activeInjury.key !== key) {
      const baseDuration = Number.isFinite(injury.duration) ? injury.duration : 10;
      const severity = clamp(baseDuration / 15, 0.75, 4);
      aging.activeInjury = { key, severity };
    }
    const severity = aging.activeInjury?.severity ?? 1;
    aging.injuryDays = (aging.injuryDays || 0) + days * severity;
  } else if (aging.activeInjury) {
    aging.activeInjury = null;
  }
}

function progressPlayerAging(player, days = 1, options = {}) {
  if (!player || typeof player !== 'object') return null;
  const rng = resolveRng(options.rng);
  const dayCount = Number.isFinite(days) && days > 0 ? days : 1;
  const aging = ensureAgingState(player, { ...options, rng });
  const updates = [];

  aging.ageDays = (Number.isFinite(aging.ageDays) ? aging.ageDays : 0) + dayCount;
  let age = Number.isFinite(player.age) ? player.age : 24;
  while (aging.ageDays >= DAYS_PER_YEAR) {
    aging.ageDays -= DAYS_PER_YEAR;
    age += 1;
  }
  player.age = age;
  const fractionalAge = age + aging.ageDays / DAYS_PER_YEAR;
  aging.ageExact = fractionalAge;

  updateInjuryHistory(player, aging, dayCount);

  const abilityKeys = getAbilityKeys(player);
  if (!abilityKeys.length) {
    aging.lastUpdatedDay = options.day ?? null;
    return {
      age: fractionalAge,
      peakAge: aging.peakAge,
      profile: aging.profile,
      declineApplied: 0,
      changes: []
    };
  }

  const yearsPastPeak = fractionalAge - aging.peakAge;
  let declineApplied = 0;

  if (yearsPastPeak > 0) {
    const profileTuning = PROFILE_TUNING[aging.profile] || PROFILE_TUNING.standard;
    const roleTuning = isPitcher(player) ? ROLE_TUNING.pitcher : ROLE_TUNING.batter;
    const injuryImpact = clamp((aging.injuryDays || 0) / 90, 0, 3.5);
    const injuryMult = 1 + Math.min(0.8, injuryImpact * 0.35);
    const ageMult = fractionalAge > 34 ? 1 + Math.min(1.2, (fractionalAge - 34) * 0.08) : 1;
    const baseDecline = 0.6 + yearsPastPeak * 0.45;
    const declinePerYear = baseDecline * profileTuning.declineMult * (roleTuning?.declineMult || 1) * injuryMult * ageMult;
    const declinePerDay = declinePerYear / DAYS_PER_YEAR;
    abilityKeys.forEach(key => {
      const before = Number(player[key]);
      if (!Number.isFinite(before)) return;
      const noise = 0.9 + rng() * 0.2;
      const drop = declinePerDay * dayCount * noise;
      if (drop <= 0) return;
      const after = clamp(before - drop, MIN_RATING, 99);
      if (after !== before) {
        player[key] = Math.round(after);
        declineApplied += before - Math.round(after);
        updates.push({ key, before, after: Math.round(after), delta: Math.round(after) - before });
      }
    });
    if (Number.isFinite(player.pot)) {
      const potBefore = player.pot;
      const potDrop = declinePerDay * dayCount * 0.35;
      if (potDrop > 0) {
        const potAfter = clamp(potBefore - potDrop, MIN_RATING, 99);
        player.pot = Math.round(potAfter);
        if (Math.round(potAfter) !== potBefore) {
          updates.push({ key: 'pot', before: potBefore, after: Math.round(potAfter), delta: Math.round(potAfter) - potBefore });
        }
      }
    }
  }

  aging.lastUpdatedDay = options.day ?? null;
  aging.lastResult = { age: fractionalAge, peakAge: aging.peakAge, profile: aging.profile, declineApplied, changes: updates };
  return aging.lastResult;
}

function normalizeRosterPlayers(roster) {
  if (!roster || typeof roster !== 'object') return [];
  const bats = Array.isArray(roster.bats) ? roster.bats : [];
  const pits = Array.isArray(roster.pits) ? roster.pits : [];
  return bats.concat(pits).filter(p => p && typeof p === 'object');
}

export function applyAging(stateOrRosters, options = {}) {
  if (!stateOrRosters) {
    return { teams: [], days: Number.isFinite(options.days) ? options.days : 1 };
  }
  const rng = resolveRng(options.rng);
  const days = Number.isFinite(options.days) && options.days > 0 ? options.days : 1;
  const rosters = stateOrRosters.rosters || stateOrRosters;
  const teamIds = options.teamIds || Object.keys(rosters || {});
  const results = [];

  teamIds.forEach(tid => {
    const roster = rosters?.[tid];
    if (!roster) return;
    const players = normalizeRosterPlayers(roster);
    const playerResults = [];
    players.forEach(player => {
      const result = progressPlayerAging(player, days, { ...options, rng });
      if (result && result.declineApplied > 0) {
        playerResults.push({ playerId: player.id, name: player.name, ...result });
      }
    });
    if (playerResults.length) {
      results.push({ teamId: tid, players: playerResults });
    }
  });

  return { teams: results, days };
}

export { ensureAgingState as ensurePlayerAgingProfile, progressPlayerAging };

export default applyAging;
