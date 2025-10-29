import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  ensureDraftState,
  initializeDraft,
  submitBid,
  resolveFirstRound,
  calculateTeamNeeds,
} from '../src/systems/draft.js';

test('first-round lottery assigns rights to a single winner', () => {
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

  assert.equal(result.winners.length, 1);
  const winner = result.winners[0];
  assert.equal(winner.teamId, 1);
  assert.equal(winner.prospect.pid, 'p1');
  assert.deepEqual(result.losers, [2]);

  assert.equal(state.draft.picks.length, 1);
  assert.equal(state.draft.picks[0].team_id, 1);
  assert.equal(state.draft.pendingFirstRound.length, 1);
  assert.equal(state.draft.pendingFirstRound[0], 2);
  assert.equal(state.draft.bids.length, 0);

  const lotteryLog = logs.find(entry => entry.type === 'lottery');
  assert.ok(lotteryLog, 'lottery event should be logged');
  assert.equal(lotteryLog.payload.winner.teamId, 1);
  assert.deepEqual(lotteryLog.payload.losers, [2]);

  const selectionLog = logs.filter(entry => entry.type === 'selection');
  assert.equal(selectionLog.length, 1);
  assert.equal(selectionLog[0].payload.teamId, 1);
  assert.equal(selectionLog[0].payload.prospect.pid, 'p1');
});

test('initializeDraft enriches prospects with metadata fields', () => {
  const state = { season: 2, teams: [], rosters: {} };
  const prospects = [
    { pid: 'b1', name: 'Alpha', type: 'BAT', age: 19, pos: 'SS', trueRatings: { con: 60, disc: 55, pwr: 58, spd: 62, fld: 59, pot: 78 } },
    { pid: 'p1', name: 'Beta', type: 'PIT', age: 21, role: 'SP', trueRatings: { velo: 62, ctrl: 57, mov: 60, stam: 61, pot: 80 } },
  ];
  const order = [1];
  initializeDraft(state, { order, prospects, rounds: 3, year: 2 });

  const pool = state.draft.pool;
  assert.equal(pool.length, 2);
  pool.forEach((prospect) => {
    assert.ok(typeof prospect.level === 'string' && prospect.level.length > 0, 'level should be set');
    assert.ok(typeof prospect.pos === 'string' && prospect.pos.length > 0, 'pos should be set');
    assert.ok(prospect.potRange && Number.isFinite(prospect.potRange.min) && Number.isFinite(prospect.potRange.max));
    assert.ok(prospect.potRange.max >= prospect.potRange.min);
    assert.ok(Number.isFinite(prospect.riskInjury));
    assert.ok(Number.isFinite(prospect.signWillingness));
  });
});

test('calculateTeamNeeds assigns needs based on roster depth', () => {
  const state = {
    teams: [{ team_id: 1 }],
    rosters: { 1: { bats: [], pits: [] } },
  };

  const emptyNeeds = calculateTeamNeeds(state, 1);
  assert.ok(emptyNeeds.C > 0.9);
  assert.ok(emptyNeeds.SP > 0.9);

  state.rosters[1].bats.push({ pos: 'C', pot: 80, age: 23 });
  state.rosters[1].bats.push({ pos: 'LF', pot: 72, age: 24 });
  state.rosters[1].pits.push({ role: 'SP', pot: 82, age: 25 });
  state.rosters[1].pits.push({ role: 'RP', pot: 76, age: 26 });

  const updatedNeeds = calculateTeamNeeds(state, 1);
  assert.ok(updatedNeeds.C < emptyNeeds.C);
  assert.ok(updatedNeeds.SP < emptyNeeds.SP);
  assert.deepEqual(state.teams[0].needs, updatedNeeds);
});
