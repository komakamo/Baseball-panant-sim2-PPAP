import test from 'node:test';
import assert from 'node:assert/strict';
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

test('base sponsor payout is awarded once and recorded', () => {
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
    results: state.results
  });

  assert.equal(first.totalPayout, 500000);
  assert.equal(finance.budget.reserves, initialReserves + 500000);
  assert.equal(finance.revenue.sponsors, 500000);
  assert.equal(finance.revenue.total, 500000);
  assert.equal(state.financeLog.length, 1);
  assert.equal(state.teamSponsors[1].deals[0].progress.baseAwarded, true);

  const second = evaluateSponsorMilestonesForDay(state, {
    day: 6,
    stage: 'REG',
    previousStage: 'REG',
    results: state.results
  });

  assert.equal(second.totalPayout, 0);
  assert.equal(finance.budget.reserves, initialReserves + 500000);
  assert.equal(state.financeLog.length, 1);
});

test('wins trigger awards sponsor bonus when threshold met', () => {
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
  });

  assert.equal(result.payouts.length, 2, 'base and wins bonus should both pay');
  assert.equal(result.totalPayout, 650000);
  assert.equal(finance.budget.reserves, initialReserves + 650000);
  assert.equal(finance.revenue.sponsors, 650000);
  assert.equal(state.teamSponsors[1].deals[0].progress.triggered['wins-50'], true);

  const repeat = evaluateSponsorMilestonesForDay(state, {
    day: 101,
    stage: 'REG',
    previousStage: 'REG',
    results: state.results
  });

  assert.equal(repeat.totalPayout, 0);
  assert.equal(finance.budget.reserves, initialReserves + 650000);
});

test('stage trigger only fires on stage transition', () => {
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
  });

  assert.equal(noTrigger.totalPayout, 0);
  assert.equal(finance.budget.reserves, initialReserves);

  const triggered = evaluateSponsorMilestonesForDay(state, {
    day: 130,
    stage: 'CS',
    previousStage: 'REG',
    results: state.results
  });

  assert.equal(triggered.totalPayout, 300000);
  assert.equal(finance.budget.reserves, initialReserves + 300000);
  assert.equal(state.teamSponsors[1].deals[0].progress.triggered['reach-cs'], true);

  const repeat = evaluateSponsorMilestonesForDay(state, {
    day: 131,
    stage: 'CS',
    previousStage: 'CS',
    results: state.results
  });

  assert.equal(repeat.totalPayout, 0);
  assert.equal(finance.budget.reserves, initialReserves + 300000);
});
