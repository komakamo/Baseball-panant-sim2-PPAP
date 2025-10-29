import { computeStaffAdjustments } from '../systems/staff.js';
import { computeFacilityAdjustments } from '../systems/facilities.js';
import { evaluateSponsorMilestonesForDay } from '../systems/sponsors.js';
import {
  ensureTeamFans,
  updateTeamFansFromPopularity
} from '../systems/fans.js';
import { applyAging as applyPlayerAging } from '../systems/aging.js';

export const DEFAULT_PLAYER_POPULARITY = 55;
export const DEFAULT_TEAM_POPULARITY = 60;

const STAGE_LABELS = {
  REG: 'レギュラー',
  IL: '交流戦',
  AS: 'オールスター',
  CS: 'クライマックス',
  JS: '日本シリーズ',
  PRE: '準備',
  POST: 'ポストシーズン'
};

const clampDefault = (value, min, max) => Math.max(min, Math.min(max, value));

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function describeStage(stage) {
  if (!stage) return STAGE_LABELS.REG;
  return STAGE_LABELS[stage] || stage;
}

export function getSeasonCalendar(state) {
  if (!state || !state.seasonInfo) return [];
  const { calendar } = state.seasonInfo;
  return Array.isArray(calendar) ? calendar : [];
}

export function maxDay(state) {
  if (state?.seasonInfo?.regularSeasonEnd) {
    return state.seasonInfo.regularSeasonEnd;
  }
  const fallback = (state?.schedule || []).reduce((m, s) => Math.max(m, s.day || 0), 0);
  if (state?.seasonInfo) {
    state.seasonInfo.regularSeasonEnd = fallback;
  }
  return fallback;
}

export function getCalendarEntry(state, day) {
  if (!state || !state.seasonInfo) return null;
  const lookup = state.seasonInfo.dayLookup || {};
  const idx = lookup[day];
  if (idx != null) {
    const calendar = state.seasonInfo.calendar;
    if (Array.isArray(calendar)) {
      return calendar[idx];
    }
  }
  const calendar = getSeasonCalendar(state);
  return calendar.find(entry => entry && (entry.date === day || entry.day === day)) || null;
}

export function updateSeasonStage(state, stage, day) {
  if (!state || !state.seasonInfo) return;
  if (stage) state.seasonInfo.stage = stage;
  if (day != null) state.seasonInfo.lastDay = day;
}

function getStageStartDay(state, stage) {
  if (!state || !state.seasonInfo) return null;
  const bounds = state.seasonInfo.stageBounds?.[stage];
  if (bounds && Number.isFinite(bounds.start)) return bounds.start;
  const calendar = getSeasonCalendar(state);
  for (const entry of calendar) {
    if (!entry || entry.stage !== stage) continue;
    const date = Number.isFinite(entry.date) ? entry.date : Number(entry.day);
    if (Number.isFinite(date)) return date;
  }
  return null;
}

function normalizeNarrativeList(narratives) {
  if (Array.isArray(narratives)) return narratives;
  if (narratives && typeof narratives === 'object') {
    return Object.values(narratives);
  }
  return [];
}

function narrativeMatches(entry, dayOffset, breakLength) {
  if (!entry || typeof entry !== 'object') return false;
  if (Number.isFinite(entry.dayOffset)) return entry.dayOffset === dayOffset;
  const pos = entry.position;
  if (pos === 'start') return dayOffset === 0;
  if (pos === 'end') return breakLength > 0 && dayOffset === breakLength - 1;
  if (pos === 'mid') return dayOffset > 0 && dayOffset < breakLength - 1;
  if (entry.stage === 'AS' && !pos && entry.dayOffset == null) return dayOffset === 0;
  return false;
}

function ensureTeamMetaDefaults(state, deps) {
  const { ensureTeamMeta } = deps;
  if (typeof ensureTeamMeta === 'function') {
    ensureTeamMeta();
  }
  if (!state || !state.teamMeta) return;
  for (const team of state.teams || []) {
    const tid = team.team_id;
    const meta = state.teamMeta[tid];
    if (!meta) continue;
    if (meta.popularity == null) {
      const baseline = Number.isFinite(team.popularity) ? team.popularity : DEFAULT_TEAM_POPULARITY;
      meta.popularity = clampDefault(baseline, 0, 100);
    }
  }
}

function ensureFinanceDefaults(state, deps) {
  const { ensureTeamFinances } = deps;
  if (typeof ensureTeamFinances === 'function') {
    ensureTeamFinances();
  }
  if (!state || !state.teamFinances) return;
  for (const team of state.teams || []) {
    const tid = team.team_id;
    const finance = state.teamFinances[tid];
    if (!finance) continue;
    if (finance.popularity == null) {
      const base = Number.isFinite(team.popularity) ? team.popularity : DEFAULT_TEAM_POPULARITY;
      finance.popularity = clampDefault(base, 0, 100);
    }
  }
}

function ensureFanDefaults(state, deps) {
  const { ensureTeamFans: ensureFans } = deps;
  if (typeof ensureFans === 'function') {
    ensureFans();
  }
  if (!state) return;
  for (const team of state.teams || []) {
    const tid = team.team_id;
    const finance = state.teamFinances?.[tid];
    ensureTeamFans(state, tid, {
      capacity: finance?.attendance?.capacity,
      ticketPrice: finance?.ticketPrice
    });
  }
}

function recordNarrative(state, entry, context, deps) {
  if (!state || !entry) return;
  const { ensureNarrativeState, logHighlight } = deps;
  if (typeof ensureNarrativeState === 'function') {
    ensureNarrativeState();
  }
  if (!Array.isArray(state.narrativeLog)) state.narrativeLog = [];
  const logEntry = {
    season: state.season || 1,
    day: context.day,
    team_id: entry.teamId ?? null,
    title: entry.title || 'オールスター速報',
    summary: entry.summary || '',
    detail: entry.detail || '',
    icon: entry.icon || 'stars',
    tag: entry.tag || 'ALL-STAR',
    players: Array.isArray(entry.players) ? entry.players.slice() : [],
    metadata: { ...(entry.metadata || {}), stage: 'AS', leagueWide: entry.teamId == null },
    effects: entry.effects || { morale: 0, fatigue: 0, ability: [] }
  };
  state.narrativeLog.push(logEntry);
  if (state.narrativeLog.length > 400) {
    state.narrativeLog.splice(0, state.narrativeLog.length - 400);
  }
  if (state.teamNarratives && logEntry.team_id != null) {
    const bucket = state.teamNarratives[logEntry.team_id] || {};
    if (!Array.isArray(bucket.events)) bucket.events = [];
    bucket.events.push({ ...logEntry });
    if (bucket.events.length > 150) {
      bucket.events.splice(0, bucket.events.length - 150);
    }
    state.teamNarratives[logEntry.team_id] = bucket;
  }
  if (typeof logHighlight === 'function') {
    const highlightText = entry.highlightText || `${logEntry.title}${logEntry.summary ? `：${logEntry.summary}` : ''}`;
    logHighlight(logEntry.icon, highlightText, {
      category: entry.category || 'season',
      day: context.day,
      stage: 'AS',
      tid: entry.teamId ?? undefined
    });
  }
}

export function applyAllStarBreakDay(state, context, deps = {}) {
  if (!state || !context || context.stage !== 'AS') return null;
  const rules = state.league?.rules?.allStarBreak || {};
  const breakLength = Math.max(0, toNumber(rules.length, 0));
  if (breakLength === 0) return null;

  ensureTeamMetaDefaults(state, deps);
  ensureFinanceDefaults(state, deps);
  ensureFanDefaults(state, deps);

  const startDay = getStageStartDay(state, 'AS') ?? context.day;
  const dayOffset = Math.max(0, context.day - startDay);
  if (dayOffset >= breakLength) return null;

  const fatigueRecovery = Math.max(0, toNumber(rules.fatigueRecovery, 0));
  const playerPopularityGain = Math.max(0, toNumber(rules.popularity?.player, 0));
  const teamPopularityGain = Math.max(0, toNumber(rules.popularity?.team, 0));

  let teamsAffected = 0;
  let playersAffected = 0;
  const fanImpacts = [];

  for (const team of state.teams || []) {
    const tid = team.team_id;
    const roster = state.rosters?.[tid];
    if (!roster) continue;
    teamsAffected++;
    const players = [
      ...(Array.isArray(roster.bats) ? roster.bats : []),
      ...(Array.isArray(roster.pits) ? roster.pits : [])
    ];
    const meta = state.teamMeta?.[tid];
    const finance = state.teamFinances?.[tid];
    if (teamPopularityGain) {
      const baseMeta = meta?.popularity ?? team.popularity ?? DEFAULT_TEAM_POPULARITY;
      const nextMeta = clampDefault(baseMeta + teamPopularityGain, 0, 100);
      if (meta) meta.popularity = nextMeta;
      team.popularity = nextMeta;
      if (finance) {
        const baseFin = finance.popularity ?? baseMeta;
        finance.popularity = clampDefault(baseFin + teamPopularityGain, 0, 100);
      }
    } else {
      if (meta && meta.popularity == null) {
        meta.popularity = clampDefault(team.popularity ?? DEFAULT_TEAM_POPULARITY, 0, 100);
      }
      if (finance && finance.popularity == null) {
        finance.popularity = clampDefault(team.popularity ?? DEFAULT_TEAM_POPULARITY, 0, 100);
      }
      if (team.popularity == null) {
        team.popularity = meta?.popularity ?? DEFAULT_TEAM_POPULARITY;
      }
    }

    ensureTeamFans(state, tid, {
      capacity: finance?.attendance?.capacity,
      ticketPrice: finance?.ticketPrice
    });

    const fanResult = updateTeamFansFromPopularity(state, tid, {
      popularity: team.popularity ?? meta?.popularity ?? DEFAULT_TEAM_POPULARITY,
      popularityDelta: teamPopularityGain
    });
    if (fanResult) {
      fanImpacts.push({ teamId: tid, ...fanResult });
    }

    for (const player of players) {
      if (!player || typeof player !== 'object') continue;
      if (fatigueRecovery) {
        const before = Number.isFinite(player.fatigue) ? player.fatigue : 20;
        player.fatigue = clampDefault(before - fatigueRecovery, 0, 100);
      }
      if (playerPopularityGain) {
        const base = Number.isFinite(player.popularity) ? player.popularity : DEFAULT_PLAYER_POPULARITY;
        player.popularity = clampDefault(base + playerPopularityGain, 0, 100);
      } else if (player.popularity == null) {
        player.popularity = DEFAULT_PLAYER_POPULARITY;
      }
      playersAffected++;
    }
  }

  const narratives = normalizeNarrativeList(rules.narratives)
    .filter(entry => narrativeMatches(entry, dayOffset, breakLength));
  narratives.forEach(entry => recordNarrative(state, entry, { day: context.day }, deps));

  if (context.previousStage !== 'AS') {
    const headline = rules.stageHeadline || `オールスター休暇開始（${breakLength}日間）`;
    if (typeof deps.logHighlight === 'function') {
      deps.logHighlight('stars', headline, { category: 'season', day: context.day, stage: 'AS' });
    }
  }

  return {
    startDay,
    dayOffset,
    fatigueRecovery,
    playerPopularityGain,
    teamPopularityGain,
    teamsAffected,
    playersAffected,
    narrativesApplied: narratives.length,
    fanImpacts
  };
}

export function applyRestDayRecovery(state, deps = {}) {
  if (!state) return;
  const ensureTeamMeta = deps.ensureTeamMeta;
  if (typeof ensureTeamMeta === 'function') {
    ensureTeamMeta();
  }
  const hasTrait = typeof deps.hasTrait === 'function' ? deps.hasTrait : () => false;
  const getPlayerEffects = typeof deps.getPlayerEffects === 'function' ? deps.getPlayerEffects : null;
  const clampFn = deps.clamp || clampDefault;

  const teams = (state.teams || []).map(t => t.team_id);
  teams.forEach(tid => {
    const meta = state.teamMeta?.[tid] || { facilities: {}, coaches: {} };
    const staff = computeStaffAdjustments(meta.coaches || {});
    const facilities = computeFacilityAdjustments(meta.facilities || {});
    const recLevel = facilities.levels?.medical ?? facilities.levels?.recovery ?? (meta.facilities?.recovery || 0);
    const condLevel = staff.levels?.cond ?? (meta.coaches?.cond || 0);
    const baseRecovery = 12 + recLevel * 5 + condLevel * 2;
    const moraleBase = 1 + condLevel * 0.5;
    const recoveryMult = (staff.recovery?.mult ?? 1) * (facilities.recovery?.mult ?? 1);
    const flatBonus = (staff.recovery?.flat ?? 0) + Math.max(0, (facilities.recovery?.flat ?? 0) * 0.5);
    const injuryDurationMult = Math.max(0.3, (staff.injuryDuration ?? 1) * (facilities.injuryDuration ?? 1));
    const tmods = (state.teamMods?.[tid]) || {};
    const auraBonus = tmods.moraleAura || 0;
    const roster = state.rosters?.[tid];
    if (!roster) return;
    const players = [
      ...(Array.isArray(roster.bats) ? roster.bats : []),
      ...(Array.isArray(roster.pits) ? roster.pits : [])
    ];
    players.forEach(player => {
      if (!player) return;
      const fatigueBefore = player.fatigue || 0;
      let recovery = baseRecovery;
      if (fatigueBefore > 80) recovery += 6;
      else if (fatigueBefore > 50) recovery += 3;
      const fatigueEffects = getPlayerEffects ? getPlayerEffects(player, 'player:fatigue') : null;
      const traitBonus = fatigueEffects?.fatigueMult ? (1 / fatigueEffects.fatigueMult) : (hasTrait(player, 'iron_man') ? 1.15 : 1.0);
      const injuryPenalty = player.injury ? clampFn(0.6 / injuryDurationMult, 0.35, 1.05) : 1.0;
      const finalRecovery = (recovery + flatBonus) * recoveryMult * traitBonus * injuryPenalty;
      player.fatigue = clampFn(fatigueBefore - finalRecovery, 0, 100);

      let moraleDelta = moraleBase;
      if (fatigueBefore > 80) moraleDelta += 1.5;
      else if (fatigueBefore > 50) moraleDelta += 1.0;
      else moraleDelta += 0.5;
      if (player.injury) moraleDelta -= 0.5;
      player.morale = clampFn((player.morale || 60) + moraleDelta + auraBonus * 0.5, 0, 100);
    });
  });
}

export function tickDay(state, deps = {}) {
  if (!state) return { events: [], restDay: true, stage: 'PRE', calendarEntry: null };
  const {
    logHighlight,
    getCalendarEntry: getEntry = getCalendarEntry,
    maxDay: getMaxDay = maxDay,
    updateSeasonStage: syncSeasonStage = updateSeasonStage,
    applyRestDayRecovery: restFn,
    handleAllStarBreak,
    ensureTeamSponsors,
    logFinanceEvent
  } = deps;

  const rng = typeof deps.rng === 'function' ? deps.rng : Math.random;

  const day = state.curr_day || 1;
  const previousStage = state.seasonInfo?.stage || 'PRE';
  const calendarEntry = getEntry(state, day);
  const stage = calendarEntry?.stage || (day > getMaxDay(state) ? 'POST' : 'REG');
  const scheduledEvents = (state.schedule || []).filter(s => s.day === day);
  const events = stage === 'AS'
    ? scheduledEvents.filter(evt => (evt?.type || 'game') !== 'game')
    : scheduledEvents;
  const calendarRest = !calendarEntry || !Array.isArray(calendarEntry.matchups) || calendarEntry.matchups.length === 0;
  const restDay = (events.length === 0 && calendarRest) || (events.length > 0 && events.every(evt => (evt?.type || 'game') === 'rest'));

  const teamAdjustmentCache = new Map();
  const getTeamAdjustments = (tid) => {
    if (!teamAdjustmentCache.has(tid)) {
      const meta = state.teamMeta?.[tid] || { facilities: {}, coaches: {} };
      teamAdjustmentCache.set(tid, {
        staff: computeStaffAdjustments(meta.coaches || {}),
        facilities: computeFacilityAdjustments(meta.facilities || {})
      });
    }
    return teamAdjustmentCache.get(tid);
  };

  (state.teams || []).forEach(team => {
    const tid = team.team_id;
    const roster = state.rosters?.[tid];
    if (!roster) return;
    const adjustments = getTeamAdjustments(tid);
    const staff = adjustments.staff;
    const facilities = adjustments.facilities;
    const injuryDurationMult = Math.max(0.3, (staff.injuryDuration ?? 1) * (facilities.injuryDuration ?? 1));
    const healStep = 1 / injuryDurationMult;
    const players = [
      ...(Array.isArray(roster.bats) ? roster.bats : []),
      ...(Array.isArray(roster.pits) ? roster.pits : [])
    ];
    players.forEach(player => {
      if (player?.injury && player.injury.duration > 0) {
        player.injury.duration = (player.injury.duration || 0) - healStep;
        if (player.injury.duration <= 0) {
          if (typeof logHighlight === 'function') {
            logHighlight('heart-pulse', `【復帰】${player.name}が怪我から復帰しました。`);
          }
          player.injury = null;
        } else if (player.injury) {
          player.injury.duration = clampDefault(player.injury.duration, 0, Number.POSITIVE_INFINITY);
        }
      }
    });
  });

  const agingResult = typeof deps.applyAging === 'function'
    ? deps.applyAging(state, { days: 1, day, stage, rng })
    : applyPlayerAging(state, { days: 1, day, stage, rng });

  if (restDay && typeof restFn === 'function') {
    restFn(state);
  }

  let stageEffects = null;
  if (typeof handleAllStarBreak === 'function') {
    stageEffects = handleAllStarBreak(state, {
      day,
      stage,
      previousStage,
      calendarEntry,
      restDay
    });
  }

  const recordSponsorNarrative = (entry) => recordNarrative(state, entry, { day }, deps);
  const sponsorEffects = evaluateSponsorMilestonesForDay(state, {
    day,
    stage,
    previousStage,
    results: state.results || [],
    stats: state.cachedMetrics?.teamStats || {}
  }, {
    ensureTeamSponsors,
    ensureTeamFinances: deps.ensureTeamFinances,
    recordNarrative: recordSponsorNarrative,
    logHighlight,
    logFinanceEvent
  });

  syncSeasonStage(state, stage, day);
  return { events, restDay, stage, calendarEntry, stageEffects, sponsorEffects, aging: agingResult };
}

export const SeasonSimulator = {
  DEFAULT_PLAYER_POPULARITY,
  DEFAULT_TEAM_POPULARITY,
  applyAllStarBreakDay
};

export default SeasonSimulator;
