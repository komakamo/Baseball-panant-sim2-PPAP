const DEFAULT_PROTECTED_LIST = [];

const MIN_SERVICE_TIME_YEARS = 6;

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function gatherCandidates(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (Number.isFinite(value)) return Number(value);
  }
  return null;
}

function resolveWarSamples(player) {
  const paths = [
    ['metrics', 'war'],
    ['metrics', 'WAR'],
    ['war'],
    ['WAR'],
    ['stats', 'war'],
    ['stats', 'WAR'],
    ['stats', 'season', 'batting', 'war'],
    ['stats', 'season', 'batting', 'WAR'],
    ['stats', 'season', 'pitching', 'war'],
    ['stats', 'season', 'pitching', 'WAR'],
    ['seasonStats', 'batting', 'war'],
    ['seasonStats', 'batting', 'WAR'],
    ['seasonStats', 'pitching', 'war'],
    ['seasonStats', 'pitching', 'WAR'],
    ['lastSeason', 'batting', 'war'],
    ['lastSeason', 'batting', 'WAR'],
    ['lastSeason', 'pitching', 'war'],
    ['lastSeason', 'pitching', 'WAR'],
  ];

  const values = [];
  for (const path of paths) {
    let cursor = player;
    let valid = true;
    for (const key of path) {
      if (cursor && typeof cursor === 'object' && key in cursor) {
        cursor = cursor[key];
      } else {
        valid = false;
        break;
      }
    }
    if (!valid) continue;
    if (Array.isArray(cursor)) {
      cursor.forEach(item => {
        const value = Number(item);
        if (Number.isFinite(value)) values.push(value);
      });
    } else {
      const value = Number(cursor);
      if (Number.isFinite(value)) values.push(value);
    }
  }
  return values;
}

function computeRecentWar(player) {
  const direct = gatherCandidates(player, ['recentWar', 'faWar']);
  if (direct != null) return Number(direct);
  const values = resolveWarSamples(player);
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => b - a);
  const slice = sorted.slice(0, 3);
  const sum = slice.reduce((acc, value) => acc + value, 0);
  return sum / slice.length;
}

function computeAverageSalary(player) {
  const explicit = gatherCandidates(player, ['averageSalary', 'avgSalary']);
  if (explicit != null) return Number(explicit);
  const history = [];
  if (Array.isArray(player?.salaryHistory)) {
    history.push(...player.salaryHistory);
  }
  const faHistory = player?.freeAgency?.salaryHistory;
  if (Array.isArray(faHistory)) {
    history.push(...faHistory);
  }
  const contract = player?.contract;
  if (contract) {
    const salary = Number(contract.AAV ?? contract.salary ?? contract.expectedAnnual);
    if (Number.isFinite(salary)) history.push(salary);
  }
  if (!history.length) return 0;
  const bounded = history.slice(-5);
  const sum = bounded.reduce((acc, value) => acc + Number(value || 0), 0);
  return sum / bounded.length;
}

export function determineFreeAgencyEligibility(player) {
  const serviceTime = toNumber(player?.serviceTime ?? player?.mlbServiceTime ?? player?.service_time ?? player?.service ?? player?.faServiceTime, 0);
  const eligible = serviceTime >= MIN_SERVICE_TIME_YEARS;
  return {
    eligible,
    serviceTime,
    threshold: MIN_SERVICE_TIME_YEARS,
  };
}

export function rankFreeAgent(player) {
  const war = computeRecentWar(player);
  const avgSalary = computeAverageSalary(player);
  const salaryFactor = avgSalary / 1000000; // convert to millions
  const score = war * 2.4 + salaryFactor * 0.15;
  let rank = 'C';
  if (war >= 5 || avgSalary >= 28000000 || score >= 11) {
    rank = 'A';
  } else if (war >= 2.5 || avgSalary >= 12000000 || score >= 5.5) {
    rank = 'B';
  }
  return {
    rank,
    score,
    war,
    averageSalary: avgSalary,
  };
}

export function ensureFreeAgencyState(state) {
  if (!state || typeof state !== 'object') {
    throw new Error('State must be an object');
  }
  if (!state.freeAgency || typeof state.freeAgency !== 'object') {
    state.freeAgency = {};
  }
  const fa = state.freeAgency;
  if (!Array.isArray(fa.compensations)) {
    fa.compensations = [];
  }
  if (!fa.players || typeof fa.players !== 'object') {
    fa.players = {};
  }
  if (!fa.protectedLists || typeof fa.protectedLists !== 'object') {
    fa.protectedLists = {};
  }
  return fa;
}

function defaultGetOverall(player) {
  return Number.isFinite(player?.overall)
    ? Number(player.overall)
    : Number.isFinite(player?.ovr)
      ? Number(player.ovr)
      : Number.isFinite(player?.pot)
        ? Number(player.pot) * 0.9
        : 50;
}

function listRosterPlayers(state, tid) {
  const roster = state?.rosters?.[tid];
  if (!roster) return [];
  const bats = Array.isArray(roster.bats) ? roster.bats : [];
  const pits = Array.isArray(roster.pits) ? roster.pits : [];
  return bats.concat(pits);
}

function defaultRemovePlayer(state, tid, playerId) {
  const roster = state?.rosters?.[tid];
  if (!roster) return null;
  const removeFrom = (list) => {
    const idx = list.findIndex(p => p?.id === playerId);
    if (idx >= 0) {
      return list.splice(idx, 1)[0];
    }
    return null;
  };
  let removed = null;
  if (Array.isArray(roster.bats)) {
    removed = removeFrom(roster.bats);
  }
  if (!removed && Array.isArray(roster.pits)) {
    removed = removeFrom(roster.pits);
  }
  return removed;
}

function defaultAddPlayer(state, tid, player) {
  if (!state.rosters) state.rosters = {};
  if (!state.rosters[tid]) state.rosters[tid] = { bats: [], pits: [] };
  const roster = state.rosters[tid];
  const target = player?.velo != null || player?.role?.toUpperCase?.()?.includes('P')
    ? roster.pits
    : roster.bats;
  if (!Array.isArray(target)) {
    if (player?.velo != null) {
      roster.pits = [player];
    } else {
      roster.bats = [player];
    }
  } else {
    target.push(player);
  }
}

function adjustBudget(state, tid, delta) {
  const finance = state?.teamFinances?.[tid];
  if (!finance) return;
  if (!finance.budget || typeof finance.budget !== 'object') {
    finance.budget = { reserves: 0 };
  }
  finance.budget.reserves = toNumber(finance.budget.reserves, 0) + delta;
}

function recordCompensation(state, details) {
  const fa = ensureFreeAgencyState(state);
  fa.compensations.push({ ...details });
  if (fa.compensations.length > 400) {
    fa.compensations.splice(0, fa.compensations.length - 400);
  }
}

export function processFreeAgentSigning(state, signingTid, playerId, options = {}) {
  if (!state) return { type: 'none', reason: 'no-state' };
  const {
    protectedList = DEFAULT_PROTECTED_LIST,
    getOverall = defaultGetOverall,
    random = Math.random,
    player: providedPlayer,
    originTid: forcedOriginTid,
    removePlayerFromRoster,
    addPlayerToRoster,
    ensurePlayerContract,
    purgeFinanceContract,
    upsertFinanceContract,
    updateFinancialSnapshots,
    logHighlight,
    recomputeAllRatings,
    cashTable = { A: 20000000, B: 12500000, C: 6000000 },
  } = options;

  const fa = ensureFreeAgencyState(state);
  const protectedSet = new Set([
    ...protectedList,
    ...((state.freeAgency?.protectedLists?.[signingTid]) || []),
  ].map(String));

  let player = providedPlayer;
  if (!player) {
    player = listRosterPlayers(state, signingTid).find(p => p?.id === playerId)
      || (state.freeAgents || []).find(p => p?.id === playerId);
  }
  if (!player) {
    return { type: 'none', reason: 'player-not-found' };
  }

  const eligibility = determineFreeAgencyEligibility(player);
  const rankInfo = rankFreeAgent(player);
  const metadata = {
    ...eligibility,
    ...rankInfo,
    ...(player.freeAgency || {}),
  };
  const originTid = forcedOriginTid ?? metadata.lastTeamId ?? metadata.originTid ?? player.lastTeamId ?? null;
  metadata.lastTeamId = originTid;
  metadata.rank = metadata.rank || rankInfo.rank;
  metadata.war = rankInfo.war;
  metadata.averageSalary = rankInfo.averageSalary;

  if (!fa.players[player.id]) {
    fa.players[player.id] = { playerId: player.id };
  }
  fa.players[player.id] = {
    ...fa.players[player.id],
    ...metadata,
    playerName: player.name,
  };

  const season = state.season ?? null;
  const day = state.curr_day ?? null;

  if (!metadata.eligible || originTid == null || originTid === signingTid) {
    const record = {
      type: 'none',
      reason: 'ineligible',
      playerId: player.id,
      signingTid,
      originTid,
      rank: metadata.rank,
      season,
      day,
    };
    metadata.compensation = record;
    fa.players[player.id] = { ...fa.players[player.id], compensation: record };
    recordCompensation(state, record);
    return record;
  }

  const candidates = listRosterPlayers(state, signingTid)
    .filter(p => p && !protectedSet.has(String(p.id)) && p.id !== player.id);
  candidates.sort((a, b) => getOverall(b) - getOverall(a));

  let awarded = null;
  let compensationRecord = null;

  if ((metadata.rank === 'A' || metadata.rank === 'B') && candidates.length) {
    const topSlice = metadata.rank === 'A' ? candidates.slice(0, 3) : candidates.slice(0, Math.max(1, Math.min(2, candidates.length)));
    const pickIndex = Math.floor(random() * topSlice.length);
    const selected = topSlice[pickIndex] || candidates[0];
    const removalFn = typeof removePlayerFromRoster === 'function'
      ? removePlayerFromRoster
      : (tid, pid) => defaultRemovePlayer(state, tid, pid);
    const additionFn = typeof addPlayerToRoster === 'function'
      ? addPlayerToRoster
      : (tid, p) => defaultAddPlayer(state, tid, p);

    const removed = removalFn(signingTid, selected.id);
    if (removed) {
      if (typeof purgeFinanceContract === 'function') {
        purgeFinanceContract(signingTid, removed.id);
      }
      if (removed.contract) {
        removed.contract.team_id = originTid;
      }
      if (typeof ensurePlayerContract === 'function') {
        const ensured = ensurePlayerContract(removed, originTid, state.season ?? 1);
        if (ensured) removed.contract = ensured;
      }
      additionFn(originTid, removed);
      if (typeof upsertFinanceContract === 'function' && removed.contract) {
        upsertFinanceContract(originTid, removed, removed.contract);
      }
      if (typeof updateFinancialSnapshots === 'function') {
        updateFinancialSnapshots(signingTid);
        updateFinancialSnapshots(originTid);
      }
      awarded = removed;
      compensationRecord = {
        type: 'player',
        playerId: removed.id,
        playerName: removed.name,
        signingTid,
        originTid,
        rank: metadata.rank,
        season,
        day,
      };
      if (typeof logHighlight === 'function') {
        logHighlight('shuffle', `【FA補償】${removed.name}が補償で${originTid}へ移籍。`, {
          category: 'finance',
          financeType: 'compensation',
          tid: originTid,
          day,
        });
      }
    }
  }

  if (!compensationRecord) {
    const amount = toNumber((cashTable || {})[metadata.rank], 0);
    if (amount > 0) {
      adjustBudget(state, signingTid, -amount);
      adjustBudget(state, originTid, amount);
      if (typeof updateFinancialSnapshots === 'function') {
        updateFinancialSnapshots(signingTid);
        updateFinancialSnapshots(originTid);
      }
      if (typeof logHighlight === 'function') {
        logHighlight('coins', `【FA補償】${originTid}が${metadata.rank}ランク補償金${Math.round(amount / 1000000)}百万円を受領。`, {
          category: 'finance',
          financeType: 'compensation',
          tid: originTid,
          day,
        });
      }
      compensationRecord = {
        type: 'cash',
        amount,
        signingTid,
        originTid,
        rank: metadata.rank,
        season,
        day,
      };
    } else {
      compensationRecord = {
        type: 'none',
        reason: 'no-cash-table',
        signingTid,
        originTid,
        rank: metadata.rank,
        season,
        day,
      };
    }
  }

  metadata.compensation = compensationRecord;
  metadata.compensationAwarded = true;
  if (awarded) metadata.compensationPlayerId = awarded.id;
  player.freeAgency = { ...player.freeAgency, ...metadata };
  fa.players[player.id] = { ...fa.players[player.id], ...metadata };

  recordCompensation(state, compensationRecord);

  if (typeof recomputeAllRatings === 'function') {
    recomputeAllRatings();
  }

  return compensationRecord;
}

export default {
  MIN_SERVICE_TIME_YEARS,
  determineFreeAgencyEligibility,
  rankFreeAgent,
  ensureFreeAgencyState,
  processFreeAgentSigning,
};
