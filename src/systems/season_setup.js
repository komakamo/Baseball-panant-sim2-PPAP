import { generateSchedule } from './schedule_generator.js';

export function initializeSeasonSchedule(state, { rules, seed, repeats }) {
  if (!state) {
    return { schedule: [], calendarInfo: {} };
  }

  const { schedule, calendarInfo } = generateSchedule({
    teams: state.teams || [],
    rules,
    seed,
    repeats,
  });

  state.schedule = schedule;
  state.seasonInfo = calendarInfo;

  if (state.league?.rules) {
    state.league.rules = {
      ...rules,
      gamesPerTeam: calendarInfo.gamesPerTeam ?? rules?.gamesPerTeam,
    };
  }

  return { schedule, calendarInfo };
}

export default initializeSeasonSchedule;
