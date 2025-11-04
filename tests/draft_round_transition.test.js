
import {
  initializeDraft,
  resolveFirstRound
} from '../src/systems/draft.js';

describe('Draft Logic - Round Transition', () => {
  let state;

  beforeEach(() => {
    state = { season: 1, teams: [{team_id: 0}, {team_id: 1}, {team_id: 2}], rosters: {} };
    const order = [0, 1, 2];
    const prospects = Array.from({ length: 20 }, (_, i) => ({
      pid: `p${i}`,
      name: `Prospect ${i}`,
      type: 'BAT',
      trueRatings: { pot: 75 },
    }));
    initializeDraft(state, { order, prospects, rounds: 4 });
  });

  it('should correctly set the draft state for round 2 after round 1 is resolved', () => {
    // Simulate the end of round 1 where all teams have bid
    state.draft.pendingFirstRound = [];
    state.draft.bids = [{teamId: 0, prospectId: 'p0'}, {teamId: 1, prospectId: 'p1'}, {teamId: 2, prospectId: 'p2'}];

    resolveFirstRound(state, {});

    // After round 1, the draft should be in round 2
    expect(state.draft.round).toBe(2);
    // The direction should be reversed for the snake draft
    expect(state.draft.direction).toBe(-1);
    // The onClockIndex should be the last team in the order
    expect(state.draft.onClockIndex).toBe(state.draft.order.length - 1);
  });
});
