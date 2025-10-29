import { normalizeRules } from './rules.js';

function mulberry32(a) {
  return function seed() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ t >>> 15, t | 1);
    t ^= t + Math.imul(t ^ t >>> 7, t | 61);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function makeRoundRobinRounds(teamIds) {
  const teams = teamIds.slice();
  if (teams.length % 2 === 1) teams.push(null);
  const n = teams.length;
  const half = n >> 1;
  const rounds = [];
  let arr = teams.slice();
  for (let r = 0; r < n - 1; r++) {
    const pairs = [];
    for (let i = 0; i < half; i++) {
      const t1 = arr[i];
      const t2 = arr[n - 1 - i];
      if (t1 != null && t2 != null) {
        pairs.push((r % 2 === 0) ? [t1, t2] : [t2, t1]);
      }
    }
    rounds.push(pairs);
    arr = [arr[0], arr[n - 1], ...arr.slice(1, n - 1)];
  }
  return rounds;
}

function makeInterleagueRounds(homeIds, awayIds, rng) {
  const len = Math.min(homeIds.length, awayIds.length);
  if (len === 0) return [];
  const home = shuffle(homeIds.slice(0, len), rng);
  const rotation = shuffle(awayIds.slice(0, len), rng);
  const rounds = [];
  let rotated = rotation.slice();
  for (let r = 0; r < len; r++) {
    const pairs = [];
    for (let i = 0; i < len; i++) {
      pairs.push([home[i], rotated[i]]);
    }
    rounds.push(pairs);
    rotated.push(rotated.shift());
  }
  return rounds;
}

export function buildSeasonCalendar({ teams = [], seed = 42, rules = {}, repeats = 6 } = {}) {
  const normalizedRules = normalizeRules(rules);
  const rng = mulberry32(seed >>> 0);
  const calendar = [];
  const dayLookup = {};
  const stageBounds = {};
  const totalsByTeam = {};
  teams.forEach(team => {
    totalsByTeam[team.team_id] = 0;
  });

  const central = teams.filter(t => t.league === 'Central').map(t => t.team_id);
  const pacific = teams.filter(t => t.league === 'Pacific').map(t => t.team_id);
  const centralRounds = makeRoundRobinRounds(central);
  const pacificRounds = makeRoundRobinRounds(pacific);

  let dayCounter = 1;
  let seriesCounter = 1;

  function pushEntry(stage, matchups) {
    const entry = { date: dayCounter, stage, matchups };
    calendar.push(entry);
    dayLookup[entry.date] = calendar.length - 1;
    dayCounter++;
    return entry;
  }

  function markStage(stage, start, end) {
    if (!stageBounds[stage]) {
      stageBounds[stage] = { start, end };
    } else {
      stageBounds[stage].start = Math.min(stageBounds[stage].start, start);
      stageBounds[stage].end = Math.max(stageBounds[stage].end, end);
    }
  }

  function countMatchup(home, away) {
    if (home == null || away == null) return;
    totalsByTeam[home] = (totalsByTeam[home] || 0) + 1;
    totalsByTeam[away] = (totalsByTeam[away] || 0) + 1;
  }

  function pickSeriesLength(stage) {
    if (stage === 'IL') {
      return Math.max(1, normalizedRules.interleague.seriesLength || 3);
    }
    return (rng() < 0.55) ? 3 : 2;
  }

  function scheduleBlock(stage, leaguePairSets, options = {}) {
    const activeSets = leaguePairSets.filter(set => Array.isArray(set) && set.length);
    if (!activeSets.length) return;
    const startDay = dayCounter;
    const seriesLength = Math.max(1, options.seriesLength || pickSeriesLength(stage));
    const keys = activeSets.map(() => seriesCounter++);
    for (let gameNo = 1; gameNo <= seriesLength; gameNo++) {
      const matchups = [];
      let keyIndex = 0;
      leaguePairSets.forEach(set => {
        if (!Array.isArray(set) || !set.length) return;
        const key = keys[keyIndex++];
        set.forEach(([home, away]) => {
          matchups.push({
            home_id: home,
            away_id: away,
            seriesGame: gameNo,
            seriesLength,
            seriesKey: key
          });
          countMatchup(home, away);
        });
      });
      pushEntry(stage, matchups);
    }
    if (options.addRest) {
      pushEntry(stage, []);
    }
    markStage(stage, startDay, dayCounter - 1);
  }

  function scheduleLeagueStage(loopCount, stage) {
    if (loopCount <= 0) return;
    const roundsPerLeague = Math.max(centralRounds.length, pacificRounds.length);
    for (let loop = 0; loop < loopCount; loop++) {
      const centralOrder = centralRounds.length ? shuffle([...Array(centralRounds.length).keys()], rng) : [];
      const pacificOrder = pacificRounds.length ? shuffle([...Array(pacificRounds.length).keys()], rng) : [];
      for (let idx = 0; idx < roundsPerLeague; idx++) {
        const centralPairs = centralRounds.length ? centralRounds[centralOrder[idx % centralRounds.length]] : [];
        const pacificPairs = pacificRounds.length ? pacificRounds[pacificOrder[idx % pacificRounds.length]] : [];
        const isFinalBlock = (loop === loopCount - 1) && (idx === roundsPerLeague - 1);
        scheduleBlock(stage, [centralPairs, pacificPairs], { addRest: !isFinalBlock });
      }
    }
  }

  const interleagueRounds = makeInterleagueRounds(central, pacific, rng);
  const teamsPerLeague = Math.max(central.length, pacific.length);
  const opponents = Math.max(0, teamsPerLeague - 1);
  const interleagueCycles = normalizedRules.interleague.enabled === false ? 0 : (normalizedRules.interleague.rounds || 0);
  const interleagueGamesPerTeam = interleagueCycles * interleagueRounds.length * Math.max(1, normalizedRules.interleague.seriesLength || 3);
  const avgSeriesLength = 2.55;
  const targetRegularGames = Math.max(0, (normalizedRules.gamesPerTeam || 0) - interleagueGamesPerTeam);
  const baseLoopEstimate = opponents > 0 ? Math.max(1, Math.round(targetRegularGames / (opponents * avgSeriesLength))) : 1;
  const baselineRepeats = 6;
  const repeatFactor = Math.max(1, repeats);
  const totalLeagueLoops = Math.max(1, Math.round(baseLoopEstimate * (repeatFactor / baselineRepeats)));
  const firstHalfLoops = Math.max(1, Math.ceil(totalLeagueLoops / 2));
  const secondHalfLoops = Math.max(0, totalLeagueLoops - firstHalfLoops);

  scheduleLeagueStage(firstHalfLoops, 'REG');

  function scheduleInterleague(cycles) {
    const totalCycles = Math.max(0, Math.floor(cycles));
    if (totalCycles <= 0 || !interleagueRounds.length) return;
    for (let cycle = 0; cycle < totalCycles; cycle++) {
      const order = shuffle([...Array(interleagueRounds.length).keys()], rng);
      order.forEach((roundIndex, idx) => {
        const basePairs = interleagueRounds[roundIndex] || [];
        const flip = ((cycle + idx) % 2 === 1);
        const pairs = flip ? basePairs.map(([home, away]) => [away, home]) : basePairs.slice();
        const isLast = (cycle === totalCycles - 1) && (idx === order.length - 1);
        scheduleBlock('IL', [pairs], {
          seriesLength: Math.max(1, normalizedRules.interleague.seriesLength || 3),
          addRest: !isLast
        });
      });
    }
  }

  scheduleInterleague(interleagueCycles);

  const breakLength = Math.max(0, normalizedRules.allStarBreak.length || 0);
  if (breakLength > 0) {
    const start = dayCounter;
    for (let i = 0; i < breakLength; i++) {
      pushEntry('AS', []);
    }
    markStage('AS', start, dayCounter - 1);
  }

  if (secondHalfLoops > 0) {
    scheduleLeagueStage(secondHalfLoops, 'REG');
  }

  const csGames = Math.max(0, normalizedRules.postseason.cs?.maxGames || 0);
  if (csGames > 0) {
    const start = dayCounter;
    for (let g = 0; g < csGames; g++) pushEntry('CS', []);
    markStage('CS', start, dayCounter - 1);
  }
  const jsGames = Math.max(0, normalizedRules.postseason.js?.maxGames || 0);
  if (jsGames > 0) {
    const start = dayCounter;
    for (let g = 0; g < jsGames; g++) pushEntry('JS', []);
    markStage('JS', start, dayCounter - 1);
  }

  const gamesPerTeam = Object.values(totalsByTeam).reduce((max, val) => Math.max(max, val || 0), 0);
  const regularSeasonEnd = calendar.reduce((max, entry) => {
    if (entry.stage === 'CS' || entry.stage === 'JS') return max;
    if (entry.stage === 'AS') return Math.max(max, entry.date);
    if (Array.isArray(entry.matchups) && entry.matchups.length) {
      return Math.max(max, entry.date);
    }
    return Math.max(max, entry.date);
  }, 0);

  return {
    calendar,
    dayLookup,
    stageBounds,
    gamesPerTeam,
    totalsByTeam,
    regularSeasonEnd,
    rules: normalizedRules
  };
}

export function calendarToSchedule(calendar) {
  if (!Array.isArray(calendar)) return [];
  const schedule = [];
  calendar.forEach(entry => {
    if (!entry || typeof entry !== 'object') return;
    const day = entry.date ?? entry.day ?? 0;
    const stage = entry.stage || 'REG';
    const matchups = Array.isArray(entry.matchups) ? entry.matchups : [];
    if (stage === 'CS' || stage === 'JS') {
      return;
    }
    if (!matchups.length) {
      schedule.push({ day, type: 'rest', stage });
      return;
    }
    matchups.forEach(matchup => {
      if (!matchup || matchup.home_id == null || matchup.away_id == null) return;
      schedule.push({
        day,
        type: 'game',
        stage,
        home_id: matchup.home_id,
        away_id: matchup.away_id,
        seriesGame: matchup.seriesGame ?? null,
        seriesLength: matchup.seriesLength ?? null,
        seriesKey: matchup.seriesKey ?? null
      });
    });
  });
  return schedule;
}

export function normalizeScheduleEntries(schedule) {
  if (!Array.isArray(schedule)) return [];
  return schedule.map(entry => {
    if (entry && entry.type) return entry;
    if (!entry) return entry;
    return { ...entry, type: 'game' };
  });
}

export const ScheduleBuilder = {
  buildSeasonCalendar,
  calendarToSchedule,
  normalizeScheduleEntries
};

export default ScheduleBuilder;
