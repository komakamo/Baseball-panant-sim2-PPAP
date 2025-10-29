const FALLBACK_LABEL = '外国人枠';

function toArray(value) {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  if (value instanceof Map) return Array.from(value.values());
  if (typeof value === 'string') return [value];
  if (typeof value[Symbol.iterator] === 'function') {
    try {
      return Array.from(value);
    } catch (_) {
      // fall back to object value extraction below
    }
  }
  if (typeof value === 'object') return Object.values(value);
  return [];
}

function toId(value) {
  if (value == null) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return null;
}

function isForeignPlayer(player) {
  if (!player || typeof player !== 'object') return false;
  if (typeof player.isForeign === 'boolean') return player.isForeign;
  if (player.foreign === true) return true;
  if (player.origin && typeof player.origin === 'string') {
    const normalized = player.origin.toLowerCase();
    if (normalized.includes('intl') || normalized.includes('overseas') || normalized.includes('foreign')) {
      return true;
    }
  }
  if (Array.isArray(player.tags)) {
    return player.tags.some(tag => typeof tag === 'string' && tag.toLowerCase() === 'foreign');
  }
  return false;
}

function uniquePlayersFrom(roster) {
  const pools = [
    toArray(roster?.players),
    toArray(roster?.bats),
    toArray(roster?.pits),
  ];
  const seen = new Set();
  const players = [];
  for (const pool of pools) {
    for (const player of pool) {
      if (!player || typeof player !== 'object') continue;
      const id = toId(player.id ?? player.pid) ?? Symbol('player');
      if (seen.has(id)) continue;
      seen.add(id);
      players.push(player);
    }
  }
  return players;
}

function resolveForeignPlayerRule(rules = {}) {
  const rosterRules = (rules && typeof rules === 'object' && rules.roster && typeof rules.roster === 'object')
    ? rules.roster
    : {};
  const foreignConfig = (rosterRules.foreignPlayers && typeof rosterRules.foreignPlayers === 'object')
    ? rosterRules.foreignPlayers
    : {};

  const limitCandidates = [
    foreignConfig.limit,
    rosterRules.foreignPlayerLimit,
    rules.foreignPlayerLimit,
  ];
  let limit = null;
  for (const candidate of limitCandidates) {
    const num = Number(candidate);
    if (Number.isFinite(num)) {
      limit = Math.max(0, Math.floor(num));
      break;
    }
  }

  const warningCandidates = [
    foreignConfig.warningThreshold,
    rosterRules.foreignPlayerWarning,
    rules.foreignPlayerWarning,
  ];
  let warningThreshold = null;
  for (const candidate of warningCandidates) {
    const num = Number(candidate);
    if (Number.isFinite(num)) {
      warningThreshold = Math.max(0, Math.floor(num));
      break;
    }
  }
  if (limit != null && warningThreshold == null) {
    warningThreshold = Math.max(0, limit - 1);
  }

  const label = typeof foreignConfig.label === 'string'
    ? foreignConfig.label
    : (typeof rosterRules.foreignPlayerLabel === 'string'
      ? rosterRules.foreignPlayerLabel
      : FALLBACK_LABEL);

  return { limit, warningThreshold, label };
}

function buildActiveSet(roster) {
  const rawLists = [
    roster?.activeIds,
    roster?.active,
    roster?.activeRoster,
    roster?.ichi,
  ];
  const set = new Set();
  for (const raw of rawLists) {
    const arr = toArray(raw);
    for (const value of arr) {
      const id = toId(value);
      if (id != null) set.add(id);
    }
  }
  return set;
}

export function validateForeignPlayerLimits(roster, rules = {}) {
  const rule = resolveForeignPlayerRule(rules);
  const players = uniquePlayersFrom(roster || {});
  const activeSet = buildActiveSet(roster || {});
  const activePlayers = activeSet.size
    ? players.filter(player => activeSet.has(toId(player?.id ?? player?.pid)))
    : players;
  const foreignPlayers = activePlayers.filter(isForeignPlayer);
  const foreignCount = foreignPlayers.length;
  const activeCount = activePlayers.length;

  const errors = [];
  const warnings = [];
  if (rule.limit != null) {
    if (foreignCount > rule.limit) {
      errors.push(`${rule.label}超過: ${foreignCount}/${rule.limit}`);
    } else if (rule.warningThreshold != null && foreignCount > rule.warningThreshold) {
      warnings.push(`${rule.label}が上限目前: ${foreignCount}/${rule.limit}`);
    }
  }

  const result = {
    label: rule.label,
    limit: rule.limit,
    warningThreshold: rule.warningThreshold,
    foreignCount,
    activeCount,
    availableSlots: rule.limit != null ? Math.max(0, rule.limit - foreignCount) : null,
    errors,
    warnings,
    foreignPlayers: foreignPlayers.map(player => ({
      id: player?.id ?? player?.pid ?? null,
      name: player?.name ?? 'Unknown',
      type: player && player.velo != null ? 'PIT' : 'BAT',
    })),
  };

  return result;
}

export default {
  validateForeignPlayerLimits,
};
