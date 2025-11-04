import ScheduleBuilder from '../core/schedule.js';

/**
 * Generates a new season schedule based on the provided ruleset and teams.
 * @param {object} options - The options for schedule generation.
 * @param {Array} options.teams - The list of teams in the league.
 * @param {object} options.rules - The ruleset to use for generation.
 * @param {number} options.seed - The random seed for generation.
 * @param {number} options.repeats - The number of times to repeat matchups.
 * @returns {{schedule: Array, calendarInfo: object}}
 */
export function generateSchedule({ teams, rules, seed, repeats }) {
  const calendarResult = ScheduleBuilder.buildSeasonCalendar({
    teams,
    rules,
    seed,
    repeats,
  });

  const schedule = ScheduleBuilder.calendarToSchedule(calendarResult.calendar);

  const calendarInfo = {
    calendar: calendarResult.calendar,
    stage: calendarResult.calendar[0]?.stage || 'PRE',
    dayLookup: calendarResult.dayLookup,
    stageBounds: calendarResult.stageBounds,
    regularSeasonEnd: calendarResult.regularSeasonEnd,
    gamesPerTeam: calendarResult.gamesPerTeam,
    totalsByTeam: calendarResult.totalsByTeam,
  };

  return { schedule, calendarInfo };
}
