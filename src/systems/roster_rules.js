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

function buildActiveSet(roster) {
  const rawLists = [
    roster?.activeIds,
    roster?.active,
    roster?.activeRoster,
    roster?.ichi,
  ];
  const set = new Set();
  let hasActiveSource = false;
  for (const raw of rawLists) {
    if (raw != null) hasActiveSource = true;
    const arr = toArray(raw);
    for (const value of arr) {
      const id = toId(value);
      if (id != null) set.add(id);
    }
  }
  return { set, hasActiveSource };
}

import { normalizeRules } from '../core/rules.js';

export function validateForeignPlayerLimits(roster, rules = {}) {
  const normalizedRules = normalizeRules(rules);
  const rosterRules = normalizedRules.roster || {};
  const rule = rosterRules.foreignPlayers || {};
  const label = rule.label || FALLBACK_LABEL;

  const players = uniquePlayersFrom(roster || {});
  const { set: activeSet, hasActiveSource } = buildActiveSet(roster || {});
  const activePlayers = hasActiveSource
    ? players.filter(p => activeSet.has(toId(p?.id ?? p?.pid)))
    : players;
  const foreignPlayers = activePlayers.filter(isForeignPlayer);
  const foreignCount = foreignPlayers.length;
  const activeCount = activePlayers.length;

  const errors = [];
  const warnings = [];
  if (rule.limit != null) {
    if (foreignCount > rule.limit) {
      errors.push(`${label}超過: ${foreignCount}/${rule.limit}`);
    } else if (rule.warningThreshold != null && foreignCount > rule.warningThreshold) {
      warnings.push(`${label}が上限目前: ${foreignCount}/${rule.limit}`);
    }
  }

  const result = {
    label: label,
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
