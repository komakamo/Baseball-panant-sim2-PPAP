import { applyAllStarBreakDay } from '../src/engine/sim_season.js';

describe('applyAllStarBreakDay', () => {
  it('should not increase player fatigue when it is initially undefined', () => {
    const state = {
      teams: [{ team_id: 'team1' }],
      rosters: {
        team1: {
          bats: [{ id: 1, name: 'Player A' }],
          pits: [],
        },
      },
      league: {
        rules: {
          allStarBreak: {
            length: 1,
            fatigueRecovery: 10,
          },
        },
      },
    };

    const context = {
      stage: 'AS',
      day: 100,
    };

    applyAllStarBreakDay(state, context);

    const player = state.rosters.team1.bats[0];
    expect(player.fatigue).toBe(0);
  });

  it('should initialize player fatigue to 0 if fatigueRecovery is not set', () => {
    const state = {
      teams: [{ team_id: 'team1' }],
      rosters: {
        team1: {
          bats: [{ id: 1, name: 'Player A' }],
          pits: [],
        },
      },
      league: {
        rules: {
          allStarBreak: {
            length: 1,
          },
        },
      },
    };

    const context = {
      stage: 'AS',
      day: 100,
    };

    applyAllStarBreakDay(state, context);

    const player = state.rosters.team1.bats[0];
    expect(player.fatigue).toBe(0);
  });
});
