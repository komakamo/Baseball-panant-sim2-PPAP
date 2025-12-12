import LeagueRules from '../src/core/rules.js';
import { initializeSeasonSchedule } from '../src/systems/season_setup.js';

describe('season initialization schedule', () => {
  const teams = [
    { team_id: 'C1', league: 'Central' },
    { team_id: 'C2', league: 'Central' },
    { team_id: 'P1', league: 'Pacific' },
    { team_id: 'P2', league: 'Pacific' },
  ];

  it('applies generated calendar info to state', () => {
    const state = {
      teams,
      league: { rules: LeagueRules.createDefaultRules() },
      season: 1,
      seed: 7,
      schedule: [],
      seasonInfo: {},
    };

    const rules = LeagueRules.ensureLeagueRules(state.league);

    initializeSeasonSchedule(state, {
      rules,
      seed: state.seed + (state.season || 0),
      repeats: 2,
    });

    expect(state.seasonInfo.gamesPerTeam).toBe(rules.gamesPerTeam);
    Object.values(state.seasonInfo.totalsByTeam || {}).forEach(total => {
      expect(total).toBe(rules.gamesPerTeam);
    });

    const gamesByTeam = {};
    state.schedule.forEach(entry => {
      if (entry.type !== 'game') return;
      gamesByTeam[entry.home_id] = (gamesByTeam[entry.home_id] || 0) + 1;
      gamesByTeam[entry.away_id] = (gamesByTeam[entry.away_id] || 0) + 1;
    });

    Object.values(gamesByTeam).forEach(total => {
      expect(total).toBe(rules.gamesPerTeam);
    });
  });
});
