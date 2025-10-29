const MIN_AAV = 8000000;
const MAX_AAV = 520000000;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const DEFAULT_PERSONA = { greed: 55, loyalty: 50, winDesire: 58 };

const POSTURE_PROFILES = {
  strong: { key: 'strong', salaryNeed: 0.12, yearNeed: 0.08, patience: -0.2, pressure: 0.06 },
  standard: { key: 'standard', salaryNeed: 0, yearNeed: 0, patience: 0, pressure: 0 },
  lenient: { key: 'lenient', salaryNeed: -0.08, yearNeed: -0.06, patience: 0.22, pressure: -0.04 },
};

const clamp01 = (value) => clamp(value, 0, 1);

function normalizePersona(source = {}) {
  const read = (key) => {
    const value = Number(source[key]);
    if (Number.isFinite(value)) return clamp(Math.round(value), 0, 100);
    return DEFAULT_PERSONA[key];
  };
  return {
    greed: read('greed'),
    loyalty: read('loyalty'),
    winDesire: read('winDesire'),
  };
}

function resolvePosture(input) {
  const key = typeof input === 'string' ? input.toLowerCase() : 'standard';
  return POSTURE_PROFILES[key] || POSTURE_PROFILES.standard;
}

const BATTER_PATHS = {
  pa: [
    ['stats', 'season', 'batting', 'pa'],
    ['stats', 'season', 'batting', 'PA'],
    ['stats', 'batting', 'pa'],
    ['stats', 'batting', 'PA'],
    ['seasonStats', 'batting', 'pa'],
    ['seasonStats', 'batting', 'PA'],
    ['metrics', 'batting', 'pa'],
    ['metrics', 'batting', 'PA'],
    ['lastSeason', 'batting', 'pa'],
    ['lastSeason', 'batting', 'PA'],
  ],
  wraa: [
    ['stats', 'season', 'batting', 'wraa'],
    ['stats', 'season', 'batting', 'wRAA'],
    ['stats', 'batting', 'wraa'],
    ['stats', 'batting', 'wRAA'],
    ['seasonStats', 'batting', 'wraa'],
    ['seasonStats', 'batting', 'wRAA'],
    ['metrics', 'batting', 'wraa'],
    ['metrics', 'batting', 'wRAA'],
    ['lastSeason', 'batting', 'wraa'],
    ['lastSeason', 'batting', 'wRAA'],
  ],
  war: [
    ['stats', 'season', 'batting', 'war'],
    ['stats', 'season', 'batting', 'WAR'],
    ['stats', 'batting', 'war'],
    ['stats', 'batting', 'WAR'],
    ['seasonStats', 'batting', 'war'],
    ['seasonStats', 'batting', 'WAR'],
    ['metrics', 'batting', 'war'],
    ['metrics', 'batting', 'WAR'],
    ['lastSeason', 'batting', 'war'],
    ['lastSeason', 'batting', 'WAR'],
  ],
};

const PITCHER_PATHS = {
  ip: [
    ['stats', 'season', 'pitching', 'ip'],
    ['stats', 'season', 'pitching', 'IP'],
    ['stats', 'pitching', 'ip'],
    ['stats', 'pitching', 'IP'],
    ['seasonStats', 'pitching', 'ip'],
    ['seasonStats', 'pitching', 'IP'],
    ['metrics', 'pitching', 'ip'],
    ['metrics', 'pitching', 'IP'],
    ['lastSeason', 'pitching', 'ip'],
    ['lastSeason', 'pitching', 'IP'],
  ],
  fip: [
    ['stats', 'season', 'pitching', 'fip'],
    ['stats', 'season', 'pitching', 'FIP'],
    ['stats', 'pitching', 'fip'],
    ['stats', 'pitching', 'FIP'],
    ['seasonStats', 'pitching', 'fip'],
    ['seasonStats', 'pitching', 'FIP'],
    ['metrics', 'pitching', 'fip'],
    ['metrics', 'pitching', 'FIP'],
    ['lastSeason', 'pitching', 'fip'],
    ['lastSeason', 'pitching', 'FIP'],
  ],
  war: [
    ['stats', 'season', 'pitching', 'war'],
    ['stats', 'season', 'pitching', 'WAR'],
    ['stats', 'pitching', 'war'],
    ['stats', 'pitching', 'WAR'],
    ['seasonStats', 'pitching', 'war'],
    ['seasonStats', 'pitching', 'WAR'],
    ['metrics', 'pitching', 'war'],
    ['metrics', 'pitching', 'WAR'],
    ['lastSeason', 'pitching', 'war'],
    ['lastSeason', 'pitching', 'WAR'],
  ],
};

function readPath(source, path) {
  let cursor = source;
  for (const key of path) {
    if (cursor && typeof cursor === 'object' && key in cursor) {
      cursor = cursor[key];
    } else {
      return null;
    }
  }
  const value = Number(cursor);
  return Number.isFinite(value) ? value : null;
}

function pickStat(source, pathGroups) {
  for (const group of pathGroups) {
    const value = readPath(source, group);
    if (value != null) return value;
  }
  return null;
}

function batterMetrics(player) {
  const pa = pickStat(player, BATTER_PATHS.pa);
  const wraa = pickStat(player, BATTER_PATHS.wraa);
  const war = pickStat(player, BATTER_PATHS.war);
  return { pa, wraa, war };
}

function pitcherMetrics(player) {
  const ip = pickStat(player, PITCHER_PATHS.ip);
  const fip = pickStat(player, PITCHER_PATHS.fip);
  const war = pickStat(player, PITCHER_PATHS.war);
  return { ip, fip, war };
}

function ageMultiplier(age, isPitcher) {
  if (!Number.isFinite(age)) return 1;
  if (age <= 24) return isPitcher ? 1.12 : 1.18;
  if (age <= 28) return 1.05;
  if (age <= 32) return 1.0;
  if (age <= 35) return isPitcher ? 0.88 : 0.92;
  return 0.8;
}

function positionMultiplier(player, isPitcher) {
  if (isPitcher) {
    const role = (player?.role || '').toUpperCase();
    if (role === 'SP') return 1.12;
    if (role === 'CL' || role === 'CP') return 1.05;
    if (role === 'RP' || role === 'LR') return 0.95;
    return 1.0;
  }
  const pos = (player?.pos || player?.position || '').toUpperCase();
  if (pos.includes('C')) return 1.14;
  if (pos.includes('SS') || pos.includes('CF')) return 1.08;
  if (pos.includes('2B')) return 1.04;
  if (pos.includes('1B') || pos.includes('LF')) return 0.94;
  return 1.0;
}

function resolveOverall(player, context) {
  const overall = context?.overall;
  if (Number.isFinite(overall)) return overall;
  if (Number.isFinite(player?.overall)) return player.overall;
  if (Number.isFinite(player?.ovr)) return player.ovr;
  if (Number.isFinite(player?.pot)) return player.pot * 0.9;
  const traits = ['con', 'pwr', 'eye', 'disc', 'spd', 'def', 'fld', 'pot', 'velo', 'ctrl', 'mov', 'stam'];
  let total = 0;
  let count = 0;
  for (const key of traits) {
    if (Number.isFinite(player?.[key])) {
      total += player[key];
      count += 1;
    }
  }
  return count ? total / count : 50;
}

function batterAAV(metrics, overall, ageFactor, posFactor) {
  const usage = clamp((metrics.pa ?? 420) / 620, 0.45, 1.35);
  const war = metrics.war ?? ((metrics.wraa ?? 0) / 10) ?? (overall - 50) / 8;
  const warAdjusted = Number.isFinite(war) ? war : (overall - 50) / 8;
  const impact = clamp(1 + (metrics.wraa ?? warAdjusted * 9) / 65, 0.7, 1.6);
  const warFactor = clamp(1 + warAdjusted / 4.5, 0.6, 1.9);
  const base = 6500000 + overall * 185000;
  return base * usage * impact * warFactor * ageFactor * posFactor;
}

function pitcherAAV(metrics, overall, ageFactor, posFactor) {
  const usage = clamp((metrics.ip ?? 140) / 180, 0.35, 1.4);
  const war = metrics.war ?? (overall - 50) / 9;
  const warAdjusted = Number.isFinite(war) ? war : (overall - 50) / 9;
  const fip = metrics.fip ?? 3.9;
  const fipFactor = clamp(4.1 / Math.max(2.3, fip), 0.65, 1.42);
  const warFactor = clamp(1 + warAdjusted / 4, 0.6, 1.95);
  const base = 6400000 + overall * 180000;
  return base * usage * fipFactor * warFactor * ageFactor * posFactor;
}

function determineYears(age, war, isPitcher) {
  let base;
  if (age <= 24) base = 5;
  else if (age <= 27) base = 4;
  else if (age <= 30) base = 3;
  else if (age <= 33) base = 2;
  else base = 1;
  if (Number.isFinite(war)) {
    if (war >= 4.5) base += 1;
    else if (war <= 1.2) base = Math.max(1, base - 1);
  }
  if (isPitcher && age >= 32) base = Math.min(base, 3);
  return clamp(Math.round(base), 1, 6);
}

function determineNoTradeClause(age, war, existing) {
  if (existing != null) return Boolean(existing);
  if (!Number.isFinite(age)) return false;
  if (age >= 33 && Number.isFinite(war) && war >= 2.5) return true;
  if (Number.isFinite(war) && war >= 6) return true;
  return false;
}

function buildIncentives(aav, metrics, isPitcher) {
  if (!Number.isFinite(aav) || aav <= 0) {
    return { playingTime: 0, performance: 0, awards: 0, total: 0, expectedPayout: 0 };
  }
  const playingSample = isPitcher ? (metrics.ip ?? 110) : (metrics.pa ?? 420);
  const war = metrics.war ?? (isPitcher ? (metrics.ip ?? 140) / 60 : (metrics.pa ?? 420) / 200);
  const playingWeight = isPitcher ? clamp(playingSample / 160, 0.4, 1.3) : clamp(playingSample / 600, 0.5, 1.35);
  const performanceWeight = clamp((war ?? 2) / 4, 0.25, 1.55);
  const base = Math.round(aav * 0.1);
  const playingTime = Math.round(base * 0.55 * playingWeight);
  const performance = Math.round(base * 0.3 * performanceWeight);
  const awards = Math.round(base * (isPitcher ? 0.15 : 0.15) * clamp(war / 3.5, 0.6, 1.5));
  const total = playingTime + performance + awards;
  const expected = Math.round(playingTime * 0.65 + performance * 0.5 + awards * 0.25);
  return { playingTime, performance, awards, total, expectedPayout: expected };
}

export function valuePlayerContract(player, context = {}) {
  const isPitcher = player?.velo != null || ['SP', 'RP', 'CL', 'CP'].includes((player?.role || '').toUpperCase());
  const age = context.age ?? player?.age ?? 26;
  const overall = resolveOverall(player, context);
  const metrics = isPitcher ? pitcherMetrics(player) : batterMetrics(player);
  if (!Number.isFinite(metrics.war)) {
    metrics.war = Number.isFinite(context.warHint) ? context.warHint : (overall - 50) / (isPitcher ? 9 : 8);
  }
  const ageFactor = ageMultiplier(age, isPitcher);
  const posFactor = positionMultiplier(player, isPitcher);
  const rawAAV = isPitcher
    ? pitcherAAV(metrics, overall, ageFactor, posFactor)
    : batterAAV(metrics, overall, ageFactor, posFactor);
  const AAV = Math.round(clamp(rawAAV, MIN_AAV, MAX_AAV) / 1000) * 1000;
  const years = determineYears(age, metrics.war, isPitcher);
  const incentives = buildIncentives(AAV, metrics, isPitcher);
  const noTradeClause = determineNoTradeClause(age, metrics.war, context.noTradeClause ?? player?.contract?.noTradeClause);
  return {
    years,
    AAV,
    incentives,
    noTradeClause,
    metrics,
    isPitcher,
    factors: { age: ageFactor, position: posFactor },
  };
}

export function normalizeContractTerms(contract = {}, context = {}) {
  const defaults = context.defaults || {};
  const reference = { ...defaults };
  const isPitcher = context.isPitcher ?? reference.isPitcher ?? false;
  const metrics = reference.metrics || {};
  const normalized = {};
  const rawYears = contract.years ?? contract.totalYears ?? reference.years ?? 1;
  normalized.years = clamp(Math.round(rawYears), 1, 6);
  const rawAAV = contract.AAV ?? contract.salary ?? reference.AAV ?? MIN_AAV;
  normalized.AAV = Math.round(clamp(rawAAV, MIN_AAV, MAX_AAV) / 1000) * 1000;
  const provided = contract.incentives;
  let incentives;
  if (provided && typeof provided === 'object') {
    const playingTime = Math.max(0, Math.round(provided.playingTime ?? provided.playtime ?? reference.incentives?.playingTime ?? 0));
    const performance = Math.max(0, Math.round(provided.performance ?? reference.incentives?.performance ?? 0));
    const awards = Math.max(0, Math.round(provided.awards ?? provided.award ?? reference.incentives?.awards ?? 0));
    let total = provided.total;
    if (!Number.isFinite(total)) total = playingTime + performance + awards;
    let expected = provided.expectedPayout;
    if (!Number.isFinite(expected)) {
      if (Number.isFinite(reference.incentives?.expectedPayout)) expected = reference.incentives.expectedPayout;
      else expected = Math.round(total * 0.6);
    }
    incentives = { playingTime, performance, awards, total: Math.round(total), expectedPayout: Math.round(Math.max(0, expected)) };
  } else {
    incentives = { ...(reference.incentives || buildIncentives(normalized.AAV, metrics, isPitcher)) };
  }
  if (!Number.isFinite(incentives.total) || incentives.total <= 0) {
    incentives = buildIncentives(normalized.AAV, metrics, isPitcher);
  } else {
    const calcTotal = incentives.playingTime + incentives.performance + incentives.awards;
    if (!Number.isFinite(incentives.total) || incentives.total !== calcTotal) {
      incentives.total = calcTotal;
    }
    if (!Number.isFinite(incentives.expectedPayout)) {
      incentives.expectedPayout = Math.round(incentives.total * 0.6);
    }
  }
  normalized.incentives = incentives;
  normalized.noTradeClause = Boolean(contract.noTradeClause ?? reference.noTradeClause ?? false);
  normalized.expectedAnnual = normalized.AAV + (normalized.incentives.expectedPayout || 0);
  return normalized;
}

export function negotiateContractOffer(player, offer = {}, context = {}) {
  const market = context.market ?? valuePlayerContract(player, context);
  const normalizedOffer = normalizeContractTerms(
    {
      years: offer.years,
      AAV: offer.AAV ?? offer.salary,
      incentives: offer.incentives,
      noTradeClause: offer.noTradeClause,
    },
    { defaults: market }
  );
  const tolerance = clamp(context.tolerance ?? 0.92, 0.75, 1.05);
  const yearsTolerance = clamp(context.yearTolerance ?? 0.75, 0.5, 1.2);
  const persona = normalizePersona(context.persona || player?.persona || {});
  const posture = resolvePosture(context.teamPosture);
  const marketYears = Math.max(1, market.years || 1);
  const greedNorm = persona.greed / 100;
  const loyaltyNorm = persona.loyalty / 100;
  const winNorm = persona.winDesire / 100;
  let salaryMultiplier = 1 + (greedNorm - 0.5) * 0.6 + posture.salaryNeed;
  if (context.isExtension) salaryMultiplier *= 1 - (loyaltyNorm - 0.5) * 0.4;
  else salaryMultiplier *= 1 + (0.5 - loyaltyNorm) * 0.3;
  salaryMultiplier = clamp(salaryMultiplier, 0.6, 1.8);
  let yearsMultiplier = 1 + (0.5 - winNorm) * 0.5 + posture.yearNeed;
  yearsMultiplier = clamp(yearsMultiplier, 0.6, 1.6);
  const salaryTarget = Math.max(MIN_AAV, market.AAV * salaryMultiplier * tolerance);
  const yearsTarget = Math.max(1, marketYears * yearsMultiplier * yearsTolerance);
  const salaryRatio = normalizedOffer.AAV / salaryTarget;
  const yearsRatio = normalizedOffer.years / yearsTarget;
  const loyaltyMood = context.isExtension ? (loyaltyNorm - 0.5) * 0.15 : (0.5 - loyaltyNorm) * 0.08;
  const ambition = (winNorm - 0.5) * 0.08;
  const satisfaction = (salaryRatio - 1) * 0.72 + (yearsRatio - 1) * 0.28 + loyaltyMood + ambition - posture.pressure;
  const dissatisfaction = Math.min(0, satisfaction);
  const patienceBase = clamp01(0.45 + posture.patience + (1 - greedNorm) * 0.25 + loyaltyNorm * 0.18);
  const baseAccept = clamp01(0.42 + satisfaction * 0.85);
  const baseBreak = clamp01((-dissatisfaction) * (0.7 + greedNorm * 0.35) + (0.55 - patienceBase) * 0.35);
  const baseRetry = clamp01(patienceBase + Math.max(0, satisfaction) * 0.12);
  const total = baseAccept + baseBreak + baseRetry || 1;
  const acceptanceProb = clamp01(baseAccept / total);
  const breakProb = clamp01(baseBreak / total);
  const retryProb = clamp01(1 - acceptanceProb - breakProb);
  const randomFn = typeof context.random === 'function' ? context.random : Math.random;
  const roll = randomFn();
  let decision;
  if (roll < acceptanceProb) decision = 'accept';
  else if (roll < acceptanceProb + breakProb) decision = 'break-off';
  else decision = 'retry';
  const accepted = decision === 'accept';
  const breakOff = decision === 'break-off';
  return {
    accepted,
    breakOff,
    retry: decision === 'retry',
    decision,
    terms: normalizedOffer,
    counter: market,
    probabilities: { accept: acceptanceProb, breakOff: breakProb, retry: retryProb },
    satisfaction,
  };
}

export default {
  valuePlayerContract,
  normalizeContractTerms,
  negotiateContractOffer,
};
