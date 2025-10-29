import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateForeignPlayerLimits } from '../src/systems/roster_rules.js';

const baseRules = {
  roster: {
    foreignPlayers: {
      limit: 4,
      warningThreshold: 1,
      label: '外国人枠'
    }
  }
};

test('validateForeignPlayerLimits returns no errors when within limit', () => {
  const roster = {
    bats: [
      { id: 'b1', name: 'Player 1', isForeign: true },
      { id: 'b2', name: 'Player 2', isForeign: false },
    ],
    pits: [
      { id: 'p1', name: 'Pitcher 1', isForeign: true },
      { id: 'p2', name: 'Pitcher 2', isForeign: false },
    ],
    activeIds: ['b1', 'b2', 'p1', 'p2']
  };

  const result = validateForeignPlayerLimits(roster, baseRules);

  assert.equal(result.foreignCount, 2);
  assert.equal(result.limit, 4);
  assert.deepEqual(result.errors, []);
  assert.ok(result.warnings.length > 0);
  assert.equal(result.warnings[0].startsWith('外国人枠'), true);
});

test('validateForeignPlayerLimits flags errors when exceeding limit', () => {
  const roster = {
    bats: [
      { id: 'b1', name: '外国1', isForeign: true },
      { id: 'b2', name: '外国2', isForeign: true },
      { id: 'b3', name: '国内', isForeign: false },
    ],
    pits: [
      { id: 'p1', name: '外国3', isForeign: true },
      { id: 'p2', name: '外国4', isForeign: true },
      { id: 'p3', name: '外国5', isForeign: true },
    ],
    activeIds: ['b1', 'b2', 'p1', 'p2', 'p3']
  };

  const result = validateForeignPlayerLimits(roster, baseRules);

  assert.equal(result.foreignCount, 5);
  assert.equal(result.limit, 4);
  assert.ok(result.errors.length > 0);
  assert.equal(result.errors[0], '外国人枠超過: 5/4');
  assert.equal(result.warnings.length, 0);
  assert.equal(result.foreignPlayers.length, 5);
});

test('validateForeignPlayerLimits respects active set and non-array collections', () => {
  const roster = {
    players: {
      a: { id: 'a', name: 'Active Foreign', isForeign: true },
      b: { id: 'b', name: 'Reserve Foreign', isForeign: true },
      c: { id: 'c', name: 'Active Domestic', isForeign: false }
    },
    activeIds: new Set(['a', 'c'])
  };

  const result = validateForeignPlayerLimits(roster, {
    roster: {
      foreignPlayers: {
        limit: 3,
        warningThreshold: 2,
        label: '外国人枠'
      }
    }
  });

  assert.equal(result.activeCount, 2);
  assert.equal(result.foreignCount, 1);
  assert.equal(result.availableSlots, 2);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});
