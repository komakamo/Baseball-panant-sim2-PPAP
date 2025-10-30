import {
  determineFreeAgencyEligibility,
  rankFreeAgent,
  ensureFreeAgencyState,
  processFreeAgentSigning,
} from '../src/systems/free_agency.js';

describe('free agency', () => {
  it('rankFreeAgent classifies elite and average players into tiers', () => {
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

    expect(rankAce.rank).toBe('A');
    expect(rankSolid.rank).toBe('B');
    expect(rankDepth.rank).toBe('C');
    expect(rankAce.score).toBeGreaterThan(rankSolid.score);
    expect(rankSolid.score).toBeGreaterThan(rankDepth.score);
  });

  it('processFreeAgentSigning awards roster player compensation when available', () => {
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

    expect(result.type).toBe('player');
    expect(result.originTid).toBe(1);
    expect(result.playerId).toBe('bat-trade');
    expect(state.rosters[1].bats.length).toBe(1);
    expect(state.rosters[1].bats[0].id).toBe('bat-trade');
    expect(state.rosters[2].bats.length).toBe(1);
    expect(state.rosters[2].bats[0].id).toBe('bat-protected');
    expect(state.freeAgency.compensations.length).toBe(1);
    expect(state.freeAgency.players[freeAgent.id].compensation.type).toBe('player');
  });

  it('processFreeAgentSigning falls back to cash compensation when roster is protected', () => {
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

    expect(result.type).toBe('cash');
    expect(result.amount).toBe(11000000);
    expect(state.teamFinances[1].budget.reserves).toBe(1000000 + 11000000);
    expect(state.teamFinances[2].budget.reserves).toBe(20000000 - 11000000);
    expect(state.freeAgency.players[freeAgent.id].compensation.type).toBe('cash');
  });

  it('determineFreeAgencyEligibility respects service time threshold', () => {
    const veteran = { serviceTime: 6.2 };
    const junior = { serviceTime: 4.9 };
    const veteranEligibility = determineFreeAgencyEligibility(veteran);
    const juniorEligibility = determineFreeAgencyEligibility(junior);
    expect(veteranEligibility.eligible).toBe(true);
    expect(juniorEligibility.eligible).toBe(false);
    expect(veteranEligibility.threshold).toBe(juniorEligibility.threshold);
  });
});
