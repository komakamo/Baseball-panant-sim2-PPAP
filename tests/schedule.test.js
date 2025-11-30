import { buildSeasonCalendar } from '../src/core/schedule.js';
import { normalizeRules } from '../src/core/rules.js';

describe('schedule builder', () => {
  const teams = [
    { team_id: 'C1', league: 'Central' },
    { team_id: 'C2', league: 'Central' },
    { team_id: 'P1', league: 'Pacific' },
    { team_id: 'P2', league: 'Pacific' },
  ];

  it('skips interleague cycles when explicitly disabled', () => {
    const rules = normalizeRules({
      interleague: { enabled: false, rounds: 2, seriesLength: 3 },
      gamesPerTeam: 12,
    });

    const { calendar, stageBounds } = buildSeasonCalendar({
      teams,
      rules,
      seed: 1,
      repeats: 2,
    });

    const interleagueEntries = calendar.filter(entry => entry.stage === 'IL');

    expect(rules.interleague.enabled).toBe(false);
    expect(interleagueEntries.length).toBe(0);
    expect(stageBounds.IL).toBeUndefined();
  });
});
