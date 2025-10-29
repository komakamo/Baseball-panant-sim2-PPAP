import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAllStarBreakDay, DEFAULT_TEAM_POPULARITY } from '../src/engine/sim_season.js';
import { DEFAULT_TICKET_PRICE, DEFAULT_STADIUM_CAPACITY } from '../src/systems/fans.js';

function createTeamState(popularityGain) {
  return {
    season: 1,
    teams: [
      { team_id: 1, name: 'Tokyo', popularity: DEFAULT_TEAM_POPULARITY }
    ],
    rosters: {
      1: { bats: [], pits: [] }
    },
    teamMeta: {
      1: {}
    },
    teamFinances: {
      1: {
        team_id: 1,
        attendance: {
          capacity: DEFAULT_STADIUM_CAPACITY,
          seasonTotal: 0,
          average: 0,
          lastGame: 0,
          forecast: 0,
          homeGames: 0
        },
        ticketPrice: DEFAULT_TICKET_PRICE,
        revenue: { ticket: 0, merch: 0, media: 0, other: 0, total: 0 },
        popularity: DEFAULT_TEAM_POPULARITY
      }
    },
    teamFans: {},
    seasonInfo: {
      stageBounds: { AS: { start: 10 } },
      calendar: [],
      dayLookup: {}
    },
    league: {
      rules: {
        allStarBreak: {
          length: 3,
          fatigueRecovery: 0,
          popularity: { team: popularityGain, player: 0 },
          narratives: []
        }
      }
    }
  };
}

test('popularity gains increase attendance and ticket revenue', () => {
  const context = { stage: 'AS', day: 10, previousStage: 'REG' };

  const baselineState = createTeamState(0);
  const baselineResult = applyAllStarBreakDay(baselineState, context);
  const baselineAttendance = baselineState.teamFinances[1].attendance.lastGame;
  const baselineRevenue = baselineState.teamFinances[1].revenue.ticket;

  assert.ok(Array.isArray(baselineResult.fanImpacts));
  assert.equal(baselineResult.fanImpacts.length, 1);
  assert.equal(baselineResult.fanImpacts[0].attendance, baselineAttendance);

  const boostedState = createTeamState(12);
  const boostedResult = applyAllStarBreakDay(boostedState, context);
  const boostedAttendance = boostedState.teamFinances[1].attendance.lastGame;
  const boostedRevenue = boostedState.teamFinances[1].revenue.ticket;

  assert.equal(boostedResult.fanImpacts.length, 1);
  assert.ok(boostedAttendance > baselineAttendance, `attendance ${boostedAttendance} should exceed ${baselineAttendance}`);
  assert.ok(boostedRevenue > baselineRevenue, `revenue ${boostedRevenue} should exceed ${baselineRevenue}`);
});
