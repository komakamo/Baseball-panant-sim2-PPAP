
import {
  initializeDraft,
  submitBid,
  resolveFirstRound,
  selectProspect
} from '../src/systems/draft.js';

describe('Draft System - Snake Draft Logic', () => {
  let state;

  beforeEach(() => {
    state = {};
  });

  test('Round 2 starts with last team and reverses order (Snake Draft)', () => {
    const teams = ['TeamA', 'TeamB', 'TeamC'];
    const prospects = [
      { pid: 'P1', name: 'Prospect 1', pot: 80 },
      { pid: 'P2', name: 'Prospect 2', pot: 70 },
      { pid: 'P3', name: 'Prospect 3', pot: 60 }
    ];

    // Initialize draft with 3 teams
    initializeDraft(state, {
      order: teams,
      prospects: prospects,
      rounds: 5
    });

    // Round 1: Everyone bids on unique players to finish round 1 cleanly
    submitBid(state, 'TeamA', 'P1');
    submitBid(state, 'TeamB', 'P2');
    submitBid(state, 'TeamC', 'P3');

    // Resolve Round 1
    const result = resolveFirstRound(state);

    // Check Round 1 completion
    expect(result.complete).toBe(true);
    expect(state.draft.round).toBe(2);

    // Verify Snake Draft Start:
    // Order: A, B, C.
    // Round 2 order should be: C, B, A.
    // So Team C (index 2) should be on clock.
    expect(state.draft.onClockIndex).toBe(teams.length - 1);
    expect(state.draft.direction).toBe(-1);
    expect(state.draft.order[state.draft.onClockIndex]).toBe('TeamC');

    // Simulate pick by TeamC
    state.draft.pool.push({ pid: 'P4', name: 'Prospect 4' });
    const pick1 = selectProspect(state, 'TeamC', 'P4');
    expect(pick1).toBeTruthy();

    // Now it should be TeamB (Index 1)
    expect(state.draft.onClockIndex).toBe(1);
    expect(state.draft.order[state.draft.onClockIndex]).toBe('TeamB');

    // Simulate pick by TeamB
    state.draft.pool.push({ pid: 'P5', name: 'Prospect 5' });
    const pick2 = selectProspect(state, 'TeamB', 'P5');
    expect(pick2).toBeTruthy();

    // Now it should be TeamA (Index 0)
    expect(state.draft.onClockIndex).toBe(0);
    expect(state.draft.order[state.draft.onClockIndex]).toBe('TeamA');

    // Simulate pick by TeamA
    state.draft.pool.push({ pid: 'P6', name: 'Prospect 6' });
    const pick3 = selectProspect(state, 'TeamA', 'P6');
    expect(pick3).toBeTruthy();

    // Now transition to Round 3
    // Round 3 should be normal order: A, B, C.
    // So TeamA (Index 0) should be on clock again.
    expect(state.draft.round).toBe(3);
    expect(state.draft.direction).toBe(1);
    expect(state.draft.onClockIndex).toBe(0);
    expect(state.draft.order[state.draft.onClockIndex]).toBe('TeamA');
  });
});
