import test from 'node:test';
import assert from 'node:assert/strict';

import { createPlateAppearanceSpecialEngine } from '../src/systems/specials.js';

const makeContext = (bases = [null, null, null]) => ({
  inning: 1,
  half: 'top',
  outs: 0,
  bases,
  scoreBefore: { home: 0, away: 0 },
  battingTeam: { side: 'away' },
  defTeam: { side: 'home' }
});

test('lefty_killer triggers only against left-handed pitchers and respects usage cap', () => {
  const engine = createPlateAppearanceSpecialEngine();
  const batter = { id: 'bat1', name: 'Lefty Crusher', hand: 'R', traits: ['lefty_killer'] };
  const leftyPitcher = { id: 'pitL', name: 'Southpaw', hand: 'L', traits: [] };
  const rightyPitcher = { id: 'pitR', name: 'Righty', hand: 'R', traits: [] };

  const first = engine.evaluate({ batter, pitcher: leftyPitcher, context: makeContext() });
  assert.ok(first, 'should trigger against left-handed pitcher');
  assert.equal(first.triggered[0].id, 'lefty_killer');
  assert.ok(first.adjustments.hitProb.add > 0, 'should boost hit probability');
  const maxUses = first.triggered[0].max || 0;

  for (let i = 1; i < maxUses; i++) {
    const follow = engine.evaluate({ batter, pitcher: leftyPitcher, context: makeContext() });
    assert.ok(follow, `use ${i + 1} should still trigger while under cap`);
  }
  const beyond = engine.evaluate({ batter, pitcher: leftyPitcher, context: makeContext() });
  assert.equal(beyond, null, 'should stop triggering after reaching usage cap');

  const versusRight = engine.evaluate({ batter, pitcher: rightyPitcher, context: makeContext() });
  assert.equal(versusRight, null, 'should not trigger against right-handed pitcher');
});

test('clutch_hitter only activates with runners in scoring position', () => {
  const engine = createPlateAppearanceSpecialEngine();
  const batter = { id: 'bat2', name: 'Clutch', hand: 'R', traits: ['clutch_hitter'] };
  const pitcher = { id: 'pit', name: 'Normal', hand: 'R', traits: [] };

  const noRisp = engine.evaluate({ batter, pitcher, context: makeContext([{ id: 'runner' }, null, null]) });
  assert.equal(noRisp, null, 'should not trigger without RISP');

  const withRisp = engine.evaluate({ batter, pitcher, context: makeContext([null, { id: 'runner2' }, null]) });
  assert.ok(withRisp, 'should trigger with runner on second');
  assert.equal(withRisp.triggered[0].id, 'clutch_hitter');
});

test('strikeout_machine boosts strike probability and reduces hits', () => {
  const engine = createPlateAppearanceSpecialEngine();
  const pitcher = { id: 'pitS', name: 'Strikeout Ace', hand: 'R', traits: ['strikeout_machine'] };
  const batter = { id: 'bat3', name: 'Batter', hand: 'L', traits: [] };

  const result = engine.evaluate({ batter, pitcher, context: makeContext() });
  assert.ok(result, 'pitcher trait should trigger');
  assert.ok(result.adjustments.strikeProb.add > 0, 'strike probability should increase');
  assert.ok(result.adjustments.hitProb.add < 0, 'hit probability should decrease');
  assert.ok(result.commentary.some(line => line.includes('特能発動')), 'commentary should note activation');
});
