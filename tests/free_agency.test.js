import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  determineFreeAgencyEligibility,
  rankFreeAgent,
  ensureFreeAgencyState,
  processFreeAgentSigning,
} from '../src/systems/free_agency.js';

test('rankFreeAgent classifies elite and average players into tiers', () => {
  const ace = {
    metrics: { war: 6.2 },
    contract: { AAV: 32000000 },
  };
  const solid = {
    metrics: { war: 3.1 },
    contract: { AAV: 9500000 },
  };
  const depth = {
    metrics: { war: 0.4 },
    contract: { AAV: 2800000 },
  };

  const rankAce = rankFreeAgent(ace);
  const rankSolid = rankFreeAgent(solid);
  const rankDepth = rankFreeAgent(depth);

  assert.equal(rankAce.rank, 'A');
  assert.equal(rankSolid.rank, 'B');
  assert.equal(rankDepth.rank, 'C');
  assert.ok(rankAce.score > rankSolid.score);
  assert.ok(rankSolid.score > rankDepth.score);
});

test('processFreeAgentSigning awards roster player compensation when available', () => {
  const state = {
    season: 4,
    curr_day: 72,
    rosters: {
      1: { bats: [], pits: [] },
      2: {
        bats: [
          { id: 'bat-protected', name: 'Protected', overall: 75 },
          { id: 'bat-trade', name: 'Comp Piece', overall: 68 },
        ],
        pits: [],
      },
    },
    teamFinances: {
      1: { budget: { reserves: 5000000 } },
      2: { budget: { reserves: 8000000 } },
    },
  };
  ensureFreeAgencyState(state);
  state.freeAgency.protectedLists[2] = ['bat-protected'];

  const freeAgent = {
    id: 'fa-1',
    name: 'Big Star',
    serviceTime: 7,
    metrics: { war: 5.8 },
    contract: { AAV: 28000000 },
    freeAgency: { lastTeamId: 1, salaryHistory: [25000000] },
  };

  const result = processFreeAgentSigning(state, 2, freeAgent.id, {
    player: freeAgent,
    protectedList: ['bat-protected'],
    getOverall: player => player.overall || 50,
    random: () => 0, // deterministic choice
  });

  assert.equal(result.type, 'player');
  assert.equal(result.originTid, 1);
  assert.equal(result.playerId, 'bat-trade');
  assert.equal(state.rosters[1].bats.length, 1);
  assert.equal(state.rosters[1].bats[0].id, 'bat-trade');
  assert.equal(state.rosters[2].bats.length, 1);
  assert.equal(state.rosters[2].bats[0].id, 'bat-protected');
  assert.equal(state.freeAgency.compensations.length, 1);
  assert.equal(state.freeAgency.players[freeAgent.id].compensation.type, 'player');
});

test('processFreeAgentSigning falls back to cash compensation when roster is protected', () => {
  const state = {
    season: 2,
    curr_day: 12,
    rosters: {
      1: { bats: [], pits: [] },
      2: {
        bats: [
          { id: 'guarded', name: 'Guarded Asset', overall: 72 },
        ],
        pits: [],
      },
    },
    teamFinances: {
      1: { budget: { reserves: 1000000 } },
      2: { budget: { reserves: 20000000 } },
    },
  };
  ensureFreeAgencyState(state);

  const freeAgent = {
    id: 'fa-2',
    name: 'Useful Arm',
    serviceTime: 6,
    metrics: { war: 2.7 },
    contract: { AAV: 9000000 },
    freeAgency: { lastTeamId: 1, salaryHistory: [9500000] },
  };

  const result = processFreeAgentSigning(state, 2, freeAgent.id, {
    player: freeAgent,
    protectedList: ['guarded'],
    getOverall: player => player.overall || 50,
    cashTable: { A: 20000000, B: 11000000, C: 5000000 },
  });

  assert.equal(result.type, 'cash');
  assert.equal(result.amount, 11000000);
  assert.equal(state.teamFinances[1].budget.reserves, 1000000 + 11000000);
  assert.equal(state.teamFinances[2].budget.reserves, 20000000 - 11000000);
  assert.equal(state.freeAgency.players[freeAgent.id].compensation.type, 'cash');
});

test('determineFreeAgencyEligibility respects service time threshold', () => {
  const veteran = { serviceTime: 6.2 };
  const junior = { serviceTime: 4.9 };
  const veteranEligibility = determineFreeAgencyEligibility(veteran);
  const juniorEligibility = determineFreeAgencyEligibility(junior);
  assert.equal(veteranEligibility.eligible, true);
  assert.equal(juniorEligibility.eligible, false);
  assert.equal(veteranEligibility.threshold, juniorEligibility.threshold);
});
