const DEFAULT_RULES = Object.freeze({
  gamesPerTeam: 143,
  interleague: {
    enabled: true,
    rounds: 1,
    seriesLength: 3,
    rotation: 'paired'
  },
  allStarBreak: {
    length: 3,
    fatigueRecovery: 18,
    popularity: { player: 2, team: 4 },
    stageHeadline: 'オールスター休暇突入',
    narratives: [
      {
        position: 'start',
        title: 'オールスター前夜祭',
        summary: 'ファンとスター選手が交流し、シーズン後半へ向け士気を高めた。',
        icon: 'stars',
        tag: 'ALL-STAR'
      },
      {
        position: 'end',
        title: '英気十分で後半戦へ',
        summary: 'リフレッシュを終えた選手たちがリーグ戦再開に備えている。',
        icon: 'sunrise',
        tag: 'ALL-STAR'
      }
    ]
  },
  postseason: {
    cs: {
      format: 'best_of_5',
      maxGames: 5
    },
    js: {
      format: 'best_of_7',
      maxGames: 7
    }
  },
  roster: {
    foreignPlayers: {
      limit: 4,
      warningThreshold: 3,
      label: '外国人枠'
    }
  }
});

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

export function createDefaultRules() {
  return deepClone(DEFAULT_RULES);
}

export function normalizeRules(input) {
  const base = DEFAULT_RULES;
  const source = (input && typeof input === 'object') ? input : {};
  const postseason = source.postseason || {};
  const rosterSource = (source.roster && typeof source.roster === 'object') ? source.roster : {};

  const normalized = {
    gamesPerTeam: typeof source.gamesPerTeam === 'number' ? source.gamesPerTeam : base.gamesPerTeam,
    interleague: { ...base.interleague, ...(source.interleague || {}) },
    allStarBreak: { ...base.allStarBreak, ...(source.allStarBreak || {}) },
    postseason: {
      cs: { ...base.postseason.cs, ...(postseason.cs || {}) },
      js: { ...base.postseason.js, ...(postseason.js || {}) }
    },
    roster: { ...base.roster, ...rosterSource }
  };

  const baseForeign = base.roster?.foreignPlayers || {};
  const foreignSource = (rosterSource.foreignPlayers && typeof rosterSource.foreignPlayers === 'object')
    ? rosterSource.foreignPlayers
    : {};
  const normalizedForeign = { ...baseForeign, ...foreignSource };

  const limitCandidates = [
    foreignSource.limit,
    rosterSource.foreignPlayerLimit,
    source.foreignPlayerLimit,
  ];
  let limit = baseForeign.limit;
  for (const candidate of limitCandidates) {
    if (candidate === null) { limit = null; break; }
    const num = Number(candidate);
    if (Number.isFinite(num)) {
      limit = Math.max(0, Math.floor(num));
      break;
    }
  }

  const warningCandidates = [
    foreignSource.warningThreshold,
    rosterSource.foreignPlayerWarning,
    source.foreignPlayerWarning,
  ];
  let warning = baseForeign.warningThreshold;
  for (const candidate of warningCandidates) {
    if (candidate === null) { warning = null; break; }
    const num = Number(candidate);
    if (Number.isFinite(num)) {
      warning = Math.max(0, Math.floor(num));
      break;
    }
  }
  if (limit != null && warning == null) {
    warning = Math.max(0, limit - 1);
  }
  if (limit == null) {
    warning = null;
  }

  normalizedForeign.limit = limit;
  normalizedForeign.warningThreshold = warning;
  normalizedForeign.label = normalizedForeign.label || baseForeign.label || '外国人枠';

  normalized.roster.foreignPlayers = normalizedForeign;

  normalized.interleague.enabled = normalized.interleague.enabled !== false;
  normalized.interleague.rounds = Math.max(0, parseInt(normalized.interleague.rounds, 10) || 0);
  if (normalized.interleague.enabled && normalized.interleague.rounds === 0) {
    normalized.interleague.rounds = base.interleague.rounds;
  }
  normalized.interleague.seriesLength = Math.max(1, parseInt(normalized.interleague.seriesLength, 10) || base.interleague.seriesLength);

  normalized.allStarBreak.length = Math.max(0, parseInt(normalized.allStarBreak.length, 10) || 0);
  normalized.allStarBreak.fatigueRecovery = Math.max(0, parseInt(normalized.allStarBreak.fatigueRecovery, 10) || 0);
  const popularity = normalized.allStarBreak.popularity || {};
  normalized.allStarBreak.popularity = {
    player: Math.max(0, parseInt(popularity.player, 10) || 0),
    team: Math.max(0, parseInt(popularity.team, 10) || 0)
  };
  if (!Array.isArray(normalized.allStarBreak.narratives)) {
    const values = normalized.allStarBreak.narratives && typeof normalized.allStarBreak.narratives === 'object'
      ? Object.values(normalized.allStarBreak.narratives)
      : [];
    normalized.allStarBreak.narratives = Array.isArray(values) ? values : [];
  }
  normalized.allStarBreak.stageHeadline = normalized.allStarBreak.stageHeadline || DEFAULT_RULES.allStarBreak.stageHeadline;

  normalized.postseason.cs.maxGames = Math.max(0, parseInt(normalized.postseason.cs.maxGames, 10) || base.postseason.cs.maxGames);
  normalized.postseason.js.maxGames = Math.max(0, parseInt(normalized.postseason.js.maxGames, 10) || base.postseason.js.maxGames);
  normalized.postseason.cs.format = normalized.postseason.cs.format || base.postseason.cs.format;
  normalized.postseason.js.format = normalized.postseason.js.format || base.postseason.js.format;

  return normalized;
}

export function ensureLeagueRules(league) {
  const safeLeague = (league && typeof league === 'object') ? league : {};
  safeLeague.rules = normalizeRules(safeLeague.rules);
  return safeLeague.rules;
}

export const LeagueRules = {
  DEFAULT_RULES,
  createDefaultRules,
  normalizeRules,
  ensureLeagueRules
};

export default LeagueRules;
