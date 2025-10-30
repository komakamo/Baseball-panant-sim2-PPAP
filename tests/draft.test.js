import {
  ensureDraftState,
  initializeDraft,
  submitBid,
  resolveFirstRound,
  calculateTeamNeeds,
} from '../src/systems/draft.js';

describe('draft', () => {
  it('first-round lottery assigns rights to a single winner', () => {
    const state = { season: 1, teams: [], rosters: {} };
    const prospects = [
      { pid: 'p1', name: 'Alpha Prospect', type: 'BAT', age: 18 },
      { pid: 'p2', name: 'Beta Prospect', type: 'PIT', age: 18 },
    ];
    const order = [1, 2];
    initializeDraft(state, { order, prospects, rounds: 5, year: 1 });
    ensureDraftState(state);

    const logs = [];
    submitBid(state, 1, 'p1');
    submitBid(state, 2, 'p1');

    const result = resolveFirstRound(state, {
      random: () => 0,
      onLog: (type, payload) => logs.push({ type, payload }),
    });

    expect(result.winners.length).toBe(1);
    const winner = result.winners[0];
    expect(winner.teamId).toBe(1);
    expect(winner.prospect.pid).toBe('p1');
    expect(result.losers).toEqual([2]);

    expect(state.draft.picks.length).toBe(1);
    expect(state.draft.picks[0].team_id).toBe(1);
    expect(state.draft.pendingFirstRound.length).toBe(1);
    expect(state.draft.pendingFirstRound[0]).toBe(2);
    expect(state.draft.bids.length).toBe(0);

    const lotteryLog = logs.find(entry => entry.type === 'lottery');
    expect(lotteryLog).toBeDefined();
    expect(lotteryLog.payload.winner.teamId).toBe(1);
    expect(lotteryLog.payload.losers).toEqual([2]);

    const selectionLog = logs.filter(entry => entry.type === 'selection');
    expect(selectionLog.length).toBe(1);
    expect(selectionLog[0].payload.teamId).toBe(1);
    expect(selectionLog[0].payload.prospect.pid).toBe('p1');
  });

  it('initializeDraft enriches prospects with metadata fields', () => {
    const state = { season: 2, teams: [], rosters: {} };
    const prospects = [
      { pid: 'b1', name: 'Alpha', type: 'BAT', age: 19, pos: 'SS', trueRatings: { con: 60, disc: 55, pwr: 58, spd: 62, fld: 59, pot: 78 } },
      { pid: 'p1', name: 'Beta', type: 'PIT', age: 21, role: 'SP', trueRatings: { velo: 62, ctrl: 57, mov: 60, stam: 61, pot: 80 } },
    ];
    const order = [1];
    initializeDraft(state, { order, prospects, rounds: 3, year: 2 });

    const pool = state.draft.pool;
    expect(pool.length).toBe(2);
    pool.forEach((prospect) => {
      expect(typeof prospect.level).toBe('string');
      expect(prospect.level.length).toBeGreaterThan(0);
      expect(typeof prospect.pos).toBe('string');
      expect(prospect.pos.length).toBeGreaterThan(0);
      expect(prospect.potRange).toBeDefined();
      expect(Number.isFinite(prospect.potRange.min)).toBe(true);
      expect(Number.isFinite(prospect.potRange.max)).toBe(true);
      expect(prospect.potRange.max).toBeGreaterThanOrEqual(prospect.potRange.min);
      expect(Number.isFinite(prospect.riskInjury)).toBe(true);
      expect(Number.isFinite(prospect.signWillingness)).toBe(true);
    });
  });

  it('calculateTeamNeeds assigns needs based on roster depth', () => {
    const state = {
      teams: [{ team_id: 1 }],
      rosters: { 1: { bats: [], pits: [] } },
    };

    const emptyNeeds = calculateTeamNeeds(state, 1);
    expect(emptyNeeds.C).toBeGreaterThan(0.9);
    expect(emptyNeeds.SP).toBeGreaterThan(0.9);

    state.rosters[1].bats.push({ pos: 'C', pot: 80, age: 23 });
    state.rosters[1].bats.push({ pos: 'LF', pot: 72, age: 24 });
    state.rosters[1].pits.push({ role: 'SP', pot: 82, age: 25 });
    state.rosters[1].pits.push({ role: 'RP', pot: 76, age: 26 });

    const updatedNeeds = calculateTeamNeeds(state, 1);
    expect(updatedNeeds.C).toBeLessThan(emptyNeeds.C);
    expect(updatedNeeds.SP).toBeLessThan(emptyNeeds.SP);
    expect(state.teams[0].needs).toEqual(updatedNeeds);
  });
});
