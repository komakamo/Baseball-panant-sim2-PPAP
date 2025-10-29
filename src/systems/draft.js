const DEFAULT_ROUNDS = 5;

const DEFAULT_TEAM_NEEDS = Object.freeze({ C: 0, IF: 0, OF: 0, SP: 0, RP: 0 });
const NEED_TARGETS = Object.freeze({ C: 2.2, IF: 7.2, OF: 5.4, SP: 6, RP: 7 });
const POSITION_BUCKET_MAP = Object.freeze({
  C: 'C',
  '1B': 'IF',
  '2B': 'IF',
  '3B': 'IF',
  SS: 'IF',
  IF: 'IF',
  DH: 'IF',
  UTIL: 'IF',
  LF: 'OF',
  CF: 'OF',
  RF: 'OF',
  OF: 'OF',
  SP: 'SP',
  RP: 'RP',
  P: 'RP',
});

function clampNumber(value, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return min;
  if (num < min) return min;
  if (num > max) return max;
  return num;
}

function hashString(str) {
  let hash = 0;
  const input = String(str ?? '');
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function random() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function createProspectRng(prospect, salt = 0) {
  const key = [prospect?.pid ?? '', prospect?.name ?? '', prospect?.type ?? '', String(salt)].join('|');
  return mulberry32(hashString(key) ^ (salt * 131));
}

function deriveProspectLevel(age, rng) {
  const roll = typeof rng === 'function' ? rng() : Math.random();
  if (age <= 19) return roll < 0.82 ? '高校' : '独立リーグ';
  if (age <= 21) return roll < 0.7 ? '大学' : '社会人';
  if (age <= 23) return roll < 0.6 ? '大学' : '社会人';
  if (age <= 25) return roll < 0.58 ? '社会人' : roll < 0.82 ? '独立リーグ' : '海外';
  return roll < 0.55 ? '独立リーグ' : '海外';
}

function deriveAgeBand(age) {
  if (!Number.isFinite(age)) return '18-19歳';
  if (age <= 19) return '18-19歳';
  if (age <= 21) return '20-21歳';
  if (age <= 24) return '22-24歳';
  if (age <= 27) return '25-27歳';
  return '28歳以上';
}

function getProspectTruePotential(prospect) {
  if (prospect?.trueRatings && Number.isFinite(prospect.trueRatings.pot)) {
    return prospect.trueRatings.pot;
  }
  if (Number.isFinite(prospect?.pot)) return prospect.pot;
  return 70;
}

function getProspectPrimaryPosition(prospect) {
  if (!prospect || typeof prospect !== 'object') return 'IF';
  if (prospect.type === 'PIT') {
    if ((prospect.role ?? '').toUpperCase() === 'SP' || (prospect.pos ?? '').toUpperCase() === 'SP') return 'SP';
    if ((prospect.role ?? '').toUpperCase() === 'RP' || (prospect.pos ?? '').toUpperCase() === 'RP') return 'RP';
    return 'RP';
  }
  const normalized = (prospect.pos ?? '').toUpperCase();
  if (POSITION_BUCKET_MAP[normalized]) return normalized;
  return 'IF';
}

function ensurePotRange(potRange, truePot, rng) {
  if (potRange && Number.isFinite(potRange.min) && Number.isFinite(potRange.max)) {
    const min = clampNumber(Math.min(potRange.min, potRange.max), 20, 99);
    const max = clampNumber(Math.max(potRange.min, potRange.max), 20, 99);
    return { min, max };
  }
  const spread = 6 + Math.round((rng?.() ?? Math.random()) * 6);
  const min = clampNumber(truePot - spread - 1, 20, 99);
  const max = clampNumber(truePot + spread + 2, 20, 99);
  return { min, max };
}

function ensureRiskRating(prospect, age, rng) {
  if (Number.isFinite(prospect?.riskInjury)) {
    return clampNumber(prospect.riskInjury, 0, 100);
  }
  const typeBase = prospect?.type === 'PIT' ? 52 : 45;
  const ageFactor = Number.isFinite(age) ? (age - 19) * (prospect?.type === 'PIT' ? 1.6 : 1.2) : 0;
  const variance = (rng?.() ?? Math.random()) * 18 - 9;
  return clampNumber(Math.round(typeBase + ageFactor + variance), 10, 95);
}

function ensureSignWillingness(prospect, level, rng) {
  if (Number.isFinite(prospect?.signWillingness)) {
    return clampNumber(prospect.signWillingness, 0, 100);
  }
  const baseByLevel = {
    高校: 62,
    大学: 68,
    社会人: 64,
    独立リーグ: 58,
    海外: 66,
  };
  const base = baseByLevel[level] ?? 63;
  const swing = (rng?.() ?? Math.random()) * 22 - 11;
  return clampNumber(Math.round(base + swing), 25, 95);
}

function ensureProspectMetadata(prospect, index = 0) {
  if (!prospect || typeof prospect !== 'object') return prospect;
  const rng = createProspectRng(prospect, index + 1);
  const resolvedAge = Number.isFinite(prospect.age) ? prospect.age : 18 + Math.floor(rng() * 5);
  const level = prospect.level ?? deriveProspectLevel(resolvedAge, rng);
  const ageBand = prospect.ageBand ?? deriveAgeBand(resolvedAge);
  const truePot = getProspectTruePotential(prospect);
  const potRange = ensurePotRange(prospect.potRange, truePot, rng);
  const riskInjury = ensureRiskRating(prospect, resolvedAge, rng);
  const signWillingness = ensureSignWillingness(prospect, level, rng);
  const primaryPos = getProspectPrimaryPosition(prospect);
  return {
    ...prospect,
    age: resolvedAge,
    level,
    ageBand,
    pos: primaryPos,
    potRange,
    riskInjury,
    signWillingness,
  };
}

function determineProspectNeedCategoryInternal(prospect) {
  if (!prospect || typeof prospect !== 'object') return null;
  if (prospect.type === 'PIT') {
    return (prospect.role ?? prospect.pos) === 'SP' ? 'SP' : 'RP';
  }
  const normalized = (prospect.pos ?? '').toUpperCase();
  const bucket = POSITION_BUCKET_MAP[normalized];
  if (bucket === 'C') return 'C';
  if (bucket === 'OF') return 'OF';
  return 'IF';
}

function weightedPlayerContribution(player) {
  if (!player || typeof player !== 'object') return 0;
  const pot = Number.isFinite(player.pot) ? player.pot : Number.isFinite(player.trueRatings?.pot) ? player.trueRatings.pot : 60;
  let weight;
  if (pot >= 85) weight = 1.15;
  else if (pot >= 75) weight = 1;
  else if (pot >= 65) weight = 0.82;
  else weight = 0.6;
  const age = Number.isFinite(player.age) ? player.age : 26;
  if (age <= 23) weight *= 1.05;
  else if (age >= 32) weight *= 0.84;
  if (player.injury) weight *= 0.7;
  return weight;
}

function calculateNeedBuckets(state, teamId, targets = NEED_TARGETS) {
  const roster = state?.rosters?.[teamId];
  if (!roster) return { ...DEFAULT_TEAM_NEEDS };
  const totals = { C: 0, IF: 0, OF: 0, SP: 0, RP: 0 };
  const bats = Array.isArray(roster.bats) ? roster.bats : [];
  const pits = Array.isArray(roster.pits) ? roster.pits : [];
  for (const batter of bats) {
    const pos = (batter?.pos ?? '').toUpperCase();
    const bucket = POSITION_BUCKET_MAP[pos] ?? 'IF';
    const contribution = weightedPlayerContribution(batter);
    totals[bucket] += contribution;
    if (bucket === 'IF' && pos === 'C') {
      totals.C += contribution;
    }
  }
  for (const pitcher of pits) {
    const role = (pitcher?.role ?? pitcher?.pos ?? '').toUpperCase();
    const bucket = role === 'SP' ? 'SP' : 'RP';
    totals[bucket] += weightedPlayerContribution(pitcher);
  }
  const needs = { ...DEFAULT_TEAM_NEEDS };
  for (const key of Object.keys(needs)) {
    const target = targets[key] ?? NEED_TARGETS[key] ?? 1;
    const deficit = (target - totals[key]) / target;
    needs[key] = clampNumber(deficit, 0, 1.5);
  }
  return needs;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function migrateDraftShape(draft) {
  if (!draft) return {};
  const migrated = { ...draft };
  if (Array.isArray(migrated.prospects) && !Array.isArray(migrated.pool)) {
    migrated.pool = migrated.prospects;
  }
  if (!Array.isArray(migrated.picks)) migrated.picks = [];
  if (!Array.isArray(migrated.bids)) migrated.bids = [];
  if (!Array.isArray(migrated.order)) migrated.order = [];
  if (!Array.isArray(migrated.pendingFirstRound)) {
    migrated.pendingFirstRound = migrated.order.slice();
  }
  if (typeof migrated.round !== 'number') {
    migrated.round = typeof migrated.currentRound === 'number' ? migrated.currentRound : 1;
  }
  delete migrated.currentRound;
  if (typeof migrated.onClockIndex !== 'number') {
    migrated.onClockIndex = 0;
  }
  if (typeof migrated.direction !== 'number') {
    migrated.direction = 1;
  }
  if (typeof migrated.rounds !== 'number') {
    migrated.rounds = DEFAULT_ROUNDS;
  }
  if (typeof migrated.active !== 'boolean') {
    migrated.active = false;
  }
  migrated.pool = ensureArray(migrated.pool).map((prospect, index) => ensureProspectMetadata(prospect, index));
  migrated.prospects = migrated.pool;
  return migrated;
}

export function ensureDraftState(state) {
  if (!state || typeof state !== 'object') throw new Error('State object is required to manage draft state');
  if (!state.draft || typeof state.draft !== 'object') {
    state.draft = {
      active: false,
      year: state.season || 1,
      rounds: DEFAULT_ROUNDS,
      round: 1,
      onClockIndex: 0,
      direction: 1,
      order: [],
      pool: [],
      picks: [],
      bids: [],
      pendingFirstRound: [],
    };
  } else {
    state.draft = migrateDraftShape(state.draft);
  }
  state.draft.pool = ensureArray(state.draft.pool).map((prospect, index) => ensureProspectMetadata(prospect, index));
  state.draft.prospects = state.draft.pool;
  return state.draft;
}

export function initializeDraft(state, { order = [], prospects = [], rounds = DEFAULT_ROUNDS, year } = {}) {
  const draft = ensureDraftState(state);
  draft.active = true;
  draft.year = year ?? state?.season ?? draft.year ?? 1;
  draft.rounds = Number.isFinite(rounds) ? Math.max(1, Math.round(rounds)) : DEFAULT_ROUNDS;
  draft.round = 1;
  draft.direction = 1;
  draft.onClockIndex = 0;
  draft.order = order.slice();
  draft.pool = ensureArray(prospects).map((prospect, index) => ensureProspectMetadata(prospect, index));
  draft.prospects = draft.pool;
  draft.picks = [];
  draft.bids = [];
  draft.pendingFirstRound = draft.order.slice();
  draft.completed = false;
  return draft;
}

function removeProspectFromPool(draft, prospectId) {
  if (!draft || !Array.isArray(draft.pool)) return null;
  const index = draft.pool.findIndex((prospect) => prospect?.pid === prospectId);
  if (index < 0) return null;
  const [prospect] = draft.pool.splice(index, 1);
  draft.prospects = draft.pool;
  return prospect;
}

function recordSelection(draft, teamId, prospect, round) {
  const pickNumber = draft.picks.filter((pick) => pick.round === round).length + 1;
  const selection = {
    round,
    pick: pickNumber,
    team_id: teamId,
    prospectId: prospect?.pid,
    name: prospect?.name,
  };
  draft.picks.push(selection);
  return selection;
}

export function getPendingFirstRoundTeams(state) {
  const draft = ensureDraftState(state);
  if (draft.round !== 1) return [];
  return draft.pendingFirstRound.slice();
}

export function submitBid(state, teamId, prospectId) {
  const draft = ensureDraftState(state);
  if (draft.round !== 1 || teamId == null || prospectId == null) return null;
  draft.bids = draft.bids.filter((bid) => bid.teamId !== teamId);
  draft.bids.push({ teamId, prospectId });
  draft.pendingFirstRound = draft.pendingFirstRound.filter((tid) => tid !== teamId);
  return { teamId, prospectId };
}

export function shouldResolveFirstRound(state) {
  const draft = ensureDraftState(state);
  return draft.round === 1 && draft.pendingFirstRound.length === 0 && draft.bids.length > 0;
}

function orderIndexResolver(order) {
  const map = new Map();
  order.forEach((teamId, index) => {
    if (!map.has(teamId)) map.set(teamId, index);
  });
  return (teamId) => map.get(teamId) ?? Number.MAX_SAFE_INTEGER;
}

export function resolveFirstRound(state, { random = Math.random, onLog } = {}) {
  const draft = ensureDraftState(state);
  if (draft.round !== 1) {
    return { winners: [], losers: [], complete: draft.round > draft.rounds };
  }
  const groups = new Map();
  for (const bid of draft.bids) {
    if (!groups.has(bid.prospectId)) groups.set(bid.prospectId, []);
    groups.get(bid.prospectId).push(bid);
  }
  const resolveOrderIndex = orderIndexResolver(draft.order);
  const winners = [];
  const loserSet = new Set();
  for (const [prospectId, bids] of groups.entries()) {
    const prospect = removeProspectFromPool(draft, prospectId);
    if (!prospect) {
      bids.forEach((bid) => loserSet.add(bid.teamId));
      continue;
    }
    const eligible = bids.slice();
    let winnerBid;
    if (eligible.length === 1) {
      [winnerBid] = eligible;
    } else {
      const roll = Math.max(0, Math.min(0.999999, Number(random())));
      const winnerIndex = Math.min(eligible.length - 1, Math.floor(roll * eligible.length));
      winnerBid = eligible[winnerIndex];
      const losers = eligible.filter((bid) => bid.teamId !== winnerBid.teamId).map((bid) => bid.teamId);
      losers.forEach((teamId) => loserSet.add(teamId));
      if (typeof onLog === 'function') {
        onLog('lottery', {
          prospect,
          winner: { teamId: winnerBid.teamId },
          losers,
        });
      }
    }
    const selection = recordSelection(draft, winnerBid.teamId, prospect, 1);
    const losers = eligible.filter((bid) => bid.teamId !== winnerBid.teamId).map((bid) => bid.teamId);
    winners.push({
      teamId: winnerBid.teamId,
      prospect,
      selection,
      contested: eligible.length > 1,
      losers,
    });
    if (typeof onLog === 'function') {
      onLog('selection', {
        round: 1,
        teamId: winnerBid.teamId,
        prospect,
        pick: selection.pick,
        contested: eligible.length > 1,
        losers,
      });
    }
  }
  draft.bids = [];
  const losers = Array.from(loserSet);
  losers.sort((a, b) => resolveOrderIndex(a) - resolveOrderIndex(b));
  draft.pendingFirstRound = losers;
  if (losers.length === 0) {
    draft.round = 2;
    draft.direction = 1;
    draft.onClockIndex = 0;
  }
  return { winners, losers, complete: losers.length === 0 };
}

export function calculateTeamNeeds(state, teamId, { targets = NEED_TARGETS, assign = true } = {}) {
  const resolvedTargets = { ...NEED_TARGETS, ...(targets || {}) };
  const needs = calculateNeedBuckets(state, teamId, resolvedTargets);
  if (assign !== false && state?.teams && Array.isArray(state.teams)) {
    const team = state.teams.find((entry) => entry?.team_id === teamId);
    if (team && typeof team === 'object') {
      team.needs = { ...needs };
    }
  }
  return needs;
}

export function getProspectNeedCategory(prospect) {
  return determineProspectNeedCategoryInternal(ensureProspectMetadata(prospect));
}

export function getOnClockTeamId(state) {
  const draft = ensureDraftState(state);
  if (draft.round === 1) return null;
  if (draft.round > draft.rounds) return null;
  const order = ensureArray(draft.order);
  if (order.length === 0) return null;
  const index = Math.max(0, Math.min(order.length - 1, draft.onClockIndex ?? 0));
  return order[index] ?? null;
}

function advanceSnakeClock(draft) {
  const order = ensureArray(draft.order);
  if (order.length === 0) {
    draft.round += 1;
    if (draft.round > draft.rounds) {
      draft.active = false;
    }
    return;
  }
  const direction = draft.direction ?? 1;
  let index = draft.onClockIndex ?? (direction === 1 ? 0 : order.length - 1);
  index += direction;
  if (index >= order.length || index < 0) {
    draft.round += 1;
    if (draft.round > draft.rounds) {
      draft.active = false;
      draft.onClockIndex = 0;
      return;
    }
    draft.direction = draft.round % 2 === 0 ? 1 : -1;
    draft.onClockIndex = draft.direction === 1 ? 0 : order.length - 1;
  } else {
    draft.onClockIndex = index;
  }
}

export function selectProspect(state, teamId, prospectId, { onLog } = {}) {
  const draft = ensureDraftState(state);
  if (draft.round === 1 || draft.round > draft.rounds) return null;
  const onClockTeam = getOnClockTeamId(state);
  if (onClockTeam != null && teamId != null && onClockTeam !== teamId) {
    return null;
  }
  const prospect = removeProspectFromPool(draft, prospectId);
  if (!prospect) return null;
  const round = draft.round;
  const selection = recordSelection(draft, teamId, prospect, round);
  if (typeof onLog === 'function') {
    onLog('selection', {
      round,
      teamId,
      prospect,
      pick: selection.pick,
      contested: false,
      losers: [],
    });
  }
  advanceSnakeClock(draft);
  return { prospect, selection };
}

export function isDraftOver(state) {
  const draft = ensureDraftState(state);
  return draft.round > draft.rounds;
}

export function isDraftActive(state) {
  const draft = ensureDraftState(state);
  return Boolean(draft.active && !isDraftOver(state));
}

export default {
  ensureDraftState,
  initializeDraft,
  submitBid,
  resolveFirstRound,
  selectProspect,
  getOnClockTeamId,
  getPendingFirstRoundTeams,
  shouldResolveFirstRound,
  isDraftOver,
  isDraftActive,
  calculateTeamNeeds,
  getProspectNeedCategory,
};
