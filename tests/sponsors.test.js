import {
  ensureSponsorDeals,
  evaluateSponsorMilestonesForDay,
  TRIGGER_TYPES
} from '../src/systems/sponsors.js';

function createResults(wins, winnerId = 1) {
  return Array.from({ length: wins }, (_, idx) => ({
    day: idx + 1,
    winner_id: winnerId,
    home_id: winnerId,
    away_id: winnerId === 1 ? 2 : 1,
    home_runs: 5,
    away_runs: 2
  }));
}

function createTeamState({ wins = 0, deals }) {
  const state = {
    curr_day: 1,
    teams: [
      { team_id: 1, name: 'Tokyo Swallows' }
    ],
    teamFinances: {
      1: {
        budget: { reserves: 1000000 },
        revenue: { ticket: 0, merch: 0, media: 0, other: 0, total: 0 }
      }
    },
    teamSponsors: {
      1: { deals }
    },
    results: createResults(wins)
  };
  ensureSponsorDeals(state, 1);
  return state;
}

describe('sponsors', () => {
  it('base sponsor payout is awarded once and recorded', () => {
    const state = createTeamState({
      wins: 0,
      deals: [
        {
          id: 'megacorp',
          name: 'MegaCorp',
          base: { amount: 500000, summary: 'Guaranteed appearance fee' },
          bonusTriggers: []
        }
      ]
    });

    const finance = state.teamFinances[1];
    const initialReserves = finance.budget.reserves;

    const first = evaluateSponsorMilestonesForDay(state, {
      day: 5,
      stage: 'REG',
      previousStage: 'PRE',
      results: state.results,
    }, { logFinanceEvent: () => {} });

    expect(first.totalPayout).toBe(500000);
    expect(finance.budget.reserves).toBe(initialReserves + 500000);
    expect(finance.revenue.sponsors).toBe(500000);
    expect(finance.revenue.total).toBe(500000);
    expect(state.teamSponsors[1].deals[0].progress.baseAwarded).toBe(true);

    const second = evaluateSponsorMilestonesForDay(state, {
      day: 6,
      stage: 'REG',
      previousStage: 'REG',
      results: state.results
    }, { logFinanceEvent: () => {} });

    expect(second.totalPayout).toBe(0);
    expect(finance.budget.reserves).toBe(initialReserves + 500000);
  });

  it('wins trigger awards sponsor bonus when threshold met', () => {
    const state = createTeamState({
      wins: 55,
      deals: [
        {
          id: 'victory',
          name: 'Victory Partners',
          base: { amount: 250000 },
          bonusTriggers: [
            {
              id: 'wins-50',
              type: TRIGGER_TYPES.WINS,
              threshold: 50,
              payout: 400000,
              description: '50 wins bonus'
            }
          ]
        }
      ]
    });

    const finance = state.teamFinances[1];
    const initialReserves = finance.budget.reserves;

    const result = evaluateSponsorMilestonesForDay(state, {
      day: 100,
      stage: 'REG',
      previousStage: 'REG',
      results: state.results
    }, { logFinanceEvent: () => {} });

    expect(result.payouts.length).toBe(2);
    expect(result.totalPayout).toBe(650000);
    expect(finance.budget.reserves).toBe(initialReserves + 650000);
    expect(finance.revenue.sponsors).toBe(650000);
    expect(state.teamSponsors[1].deals[0].progress.triggered['wins-50']).toBe(true);

    const repeat = evaluateSponsorMilestonesForDay(state, {
      day: 101,
      stage: 'REG',
      previousStage: 'REG',
      results: state.results
    }, { logFinanceEvent: () => {} });

    expect(repeat.totalPayout).toBe(0);
    expect(finance.budget.reserves).toBe(initialReserves + 650000);
  });

  it('stage trigger only fires on stage transition', () => {
    const state = createTeamState({
      wins: 0,
      deals: [
        {
          id: 'postseason',
          name: 'Postseason Energy',
          base: 0,
          bonusTriggers: [
            {
              id: 'reach-cs',
              type: TRIGGER_TYPES.STAGE,
              stage: ['CS'],
              payout: 300000,
              description: 'Climax Series entry bonus'
            }
          ]
        }
      ]
    });

    const finance = state.teamFinances[1];
    const initialReserves = finance.budget.reserves;

    const noTrigger = evaluateSponsorMilestonesForDay(state, {
      day: 120,
      stage: 'REG',
      previousStage: 'REG',
      results: state.results
    }, { logFinanceEvent: () => {} });

    expect(noTrigger.totalPayout).toBe(0);
    expect(finance.budget.reserves).toBe(initialReserves);

    const triggered = evaluateSponsorMilestonesForDay(state, {
      day: 130,
      stage: 'CS',
      previousStage: 'REG',
      results: state.results
    }, { logFinanceEvent: () => {} });

    expect(triggered.totalPayout).toBe(300000);
    expect(finance.budget.reserves).toBe(initialReserves + 300000);
    expect(state.teamSponsors[1].deals[0].progress.triggered['reach-cs']).toBe(true);

    const repeat = evaluateSponsorMilestonesForDay(state, {
      day: 131,
      stage: 'CS',
      previousStage: 'CS',
      results: state.results
    }, { logFinanceEvent: () => {} });

    expect(repeat.totalPayout).toBe(0);
    expect(finance.budget.reserves).toBe(initialReserves + 300000);
  });
});
