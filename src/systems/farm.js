const DEFAULT_DAYS = 7;
const REVEAL_CAP = 100;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function ensurePlayerFarmState(player) {
  if (!player || typeof player !== 'object') return;
  if (!Number.isFinite(player.farmReveal)) player.farmReveal = 0;
  player.farmReveal = clamp(Math.round(player.farmReveal), 0, REVEAL_CAP);
}

function resolveRoster(state, teamId) {
  if (!state || typeof state !== 'object') return null;
  const rosters = state.rosters || {};
  return rosters[teamId] || null;
}

function findPlayer(state, teamId, playerId) {
  const roster = resolveRoster(state, teamId);
  if (!roster) return null;
  const bats = Array.isArray(roster.bats) ? roster.bats : [];
  const pits = Array.isArray(roster.pits) ? roster.pits : [];
  return bats.find(p => p?.id === playerId) || pits.find(p => p?.id === playerId) || null;
}

function computeRevealGain(player, days, rng) {
  if (!player) return 0;
  const potential = clamp(toNumber(player.pot, 60), 30, 99);
  const morale = clamp(toNumber(player.morale, 60), 0, 100);
  const fatigue = clamp(toNumber(player.fatigue, 20), 0, 100);
  const age = clamp(toNumber(player.age, 24), 16, 45);
  const current = clamp(toNumber(player.farmReveal, 0), 0, REVEAL_CAP);

  const base = 1.1 * days;
  const potentialFactor = clamp(0.85 + (potential - 60) / 160, 0.55, 1.35);
  const moraleFactor = clamp(0.9 + (morale - 60) / 180, 0.6, 1.25);
  const fatigueFactor = clamp(1.05 - fatigue / 180, 0.65, 1.15);
  const ageFactor = age <= 23 ? 1.18 : age <= 27 ? 1.0 : age <= 32 ? 0.85 : 0.75;
  const progressFactor = clamp(1.1 - current / 220, 0.6, 1.1);
  const noise = 0.85 + rng() * 0.3;

  const gain = Math.round(base * potentialFactor * moraleFactor * fatigueFactor * ageFactor * progressFactor * noise);
  return Math.max(0, gain);
}

function computeFatigueRecovery(player, days, rng) {
  if (!player) return 0;
  const conditioning = clamp(toNumber(player.stam ?? player.spd, 58), 30, 99);
  const reveal = clamp(toNumber(player.farmReveal, 0), 0, REVEAL_CAP);
  const base = 0.95 * days;
  const conditioningFactor = clamp(0.85 + (conditioning - 60) / 140, 0.6, 1.3);
  const revealFactor = clamp(0.9 + reveal / 250, 0.9, 1.35);
  const noise = 0.85 + rng() * 0.35;
  const recovery = Math.round(base * conditioningFactor * revealFactor * noise);
  return Math.max(0, recovery);
}

function rollTraitUnlock(player, traitRules, rng, days, traitRateMultiplier = 1) {
  if (!Array.isArray(traitRules) || traitRules.length === 0) return [];
  const traits = Array.isArray(player?.traits) ? player.traits : [];
  const eligible = traitRules.filter(rule => {
    if (!rule || typeof rule !== 'object') return false;
    if (!rule.name || typeof rule.cond !== 'function') return false;
    const traitId = rule.id || rule.name;
    if (traitId && traits.includes(traitId)) return false;
    if (traits.includes(rule.name)) return false;
    try {
      return !!rule.cond(player);
    } catch (err) {
      return false;
    }
  });
  if (!eligible.length) return [];
  const reveal = clamp(toNumber(player?.farmReveal, 0), 0, REVEAL_CAP);
  const baseChance = 0.05 * (days / DEFAULT_DAYS);
  const tunedMultiplier = Number.isFinite(traitRateMultiplier) ? Math.max(0, traitRateMultiplier) : 1;
  const chance = Math.min(0.4, baseChance * (0.7 + reveal / 125) * tunedMultiplier);
  if (rng() >= chance) return [];
  const idx = Math.floor(rng() * eligible.length);
  const selected = eligible[clamp(idx, 0, eligible.length - 1)];
  return selected ? [selected.name] : [];
}

export function applyFarmEffects(state, options = {}) {
  if (!state || typeof state !== 'object') {
    return { teamId: null, days: DEFAULT_DAYS, label: options?.label ?? '二軍調整', players: [] };
  }
  const teamId = options.teamId;
  const days = Number.isFinite(options.days) && options.days > 0 ? options.days : DEFAULT_DAYS;
  const label = options.label ?? '二軍調整';
  const traitRules = Array.isArray(options.traitRules) ? options.traitRules : [];
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const modifiers = options.modifiers || {};
  const recoveryMult = Number.isFinite(modifiers.recoveryMult) ? Math.max(0, modifiers.recoveryMult) : 1;
  const recoveryFlat = Number.isFinite(modifiers.recoveryFlat) ? modifiers.recoveryFlat : 0;
  const traitRateMultiplier = Number.isFinite(modifiers.traitUnlockRate) ? modifiers.traitUnlockRate : 1;
  const squads = state.squads || {};
  const squad = squads[teamId] || {};
  const ni = Array.isArray(squad.ni) ? squad.ni : [];

  const results = [];
  ni.forEach(pid => {
    const player = findPlayer(state, teamId, pid);
    if (!player) return;
    ensurePlayerFarmState(player);

    if (player.injury) {
      results.push({
        playerId: pid,
        revealBefore: player.farmReveal,
        revealAfter: player.farmReveal,
        revealGain: 0,
        fatigueBefore: player.fatigue,
        fatigueAfter: player.fatigue,
        fatigueRecovered: 0,
        traitUnlocks: [],
        milestones: [],
        messages: ['リハビリ中'],
      });
      return;
    }

    const revealBefore = clamp(toNumber(player.farmReveal, 0), 0, REVEAL_CAP);
    const fatigueBefore = clamp(toNumber(player.fatigue, 20), 0, 100);

    const revealGain = revealBefore >= REVEAL_CAP ? 0 : computeRevealGain(player, days, rng);
    const revealAfter = clamp(revealBefore + revealGain, 0, REVEAL_CAP);
    player.farmReveal = revealAfter;

    const fatigueRecoveryBase = fatigueBefore <= 0 ? 0 : computeFatigueRecovery(player, days, rng);
    const fatigueRecovery = Math.max(0, Math.round(fatigueRecoveryBase * recoveryMult + recoveryFlat));
    const fatigueAfter = clamp(fatigueBefore - fatigueRecovery, 0, 100);
    player.fatigue = fatigueAfter;

    const traitUnlocks = rollTraitUnlock(player, traitRules, rng, days, traitRateMultiplier);
    const thresholds = [25, 50, 75, 100];
    const milestones = thresholds.filter(t => revealBefore < t && revealAfter >= t);

    const messages = [];
    if (revealGain > 0) messages.push(`潜在+${revealGain}% → ${revealAfter}%`);
    if (fatigueRecovery > 0) messages.push(`疲労-${fatigueRecovery}`);
    traitUnlocks.forEach(name => messages.push(`覚醒:${name}`));
    milestones.forEach(mark => messages.push(`達成:${mark}%`));

    results.push({
      playerId: pid,
      revealBefore,
      revealAfter,
      revealGain,
      fatigueBefore,
      fatigueAfter,
      fatigueRecovered: fatigueBefore - fatigueAfter,
      traitUnlocks,
      milestones,
      messages,
    });
  });

  return { teamId, days, label, players: results };
}

export default applyFarmEffects;
