import { normalizeRules } from '../src/core/rules.js';
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

describe('roster rules', () => {
  it('validateForeignPlayerLimits returns no errors when within limit', () => {
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

    expect(result.foreignCount).toBe(2);
    expect(result.limit).toBe(4);
    expect(result.errors).toEqual([]);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].startsWith('外国人枠')).toBe(true);
  });

  it('validateForeignPlayerLimits flags errors when exceeding limit', () => {
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

    expect(result.foreignCount).toBe(5);
    expect(result.limit).toBe(4);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toBe('外国人枠超過: 5/4');
    expect(result.warnings.length).toBe(0);
    expect(result.foreignPlayers.length).toBe(5);
  });

  it('validateForeignPlayerLimits respects active set and non-array collections', () => {
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

    expect(result.activeCount).toBe(2);
    expect(result.foreignCount).toBe(1);
    expect(result.availableSlots).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it('should return 0 foreign players if active roster is empty', () => {
    const roster = {
      bats: [
        { id: 'b1', name: 'Player 1', isForeign: true },
        { id: 'b2', name: 'Player 2', isForeign: true },
      ],
      activeIds: []
    };
    const result = validateForeignPlayerLimits(roster, baseRules);
    expect(result.foreignCount).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it('validateForeignPlayerLimits should apply default rules when none are provided', () => {
    const roster = {
      bats: [
        { id: 'b1', name: '外国1', isForeign: true },
        { id: 'b2', name: '外国2', isForeign: true },
      ],
      pits: [
        { id: 'p1', name: '外国3', isForeign: true },
        { id: 'p2', name: '外国4', isForeign: true },
        { id: 'p3', name: '外国5', isForeign: true },
      ],
      activeIds: ['b1', 'b2', 'p1', 'p2', 'p3']
    };

    // Normalize an empty rules object to get the default rules
    const rules = normalizeRules({});
    const result = validateForeignPlayerLimits(roster, rules);

    // This assertion should now pass
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.foreignCount).toBe(5);
    // The limit should be the default, but the bug causes it to be null
    expect(result.limit).toBe(4);
    expect(result.errors[0]).toBe('外国人枠超過: 5/4');
  });

  it('should fail when foreign player limit is exceeded and no rules are given', () => {
    const roster = {
      bats: [
        { id: 'b1', name: '外国1', isForeign: true },
        { id: 'b2', name: '外国2', isForeign: true },
      ],
      pits: [
        { id: 'p1', name: '外国3', isForeign: true },
        { id: 'p2', name: '外国4', isForeign: true },
        { id: 'p3', name: '外国5', isForeign: true },
      ],
      activeIds: ['b1', 'b2', 'p1', 'p2', 'p3']
    };

    const result = validateForeignPlayerLimits(roster, {});

    expect(result.foreignCount).toBe(5);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('falls back to default limits when rules are empty or missing values', () => {
    const roster = {
      bats: [
        { id: 'b1', name: '外国1', isForeign: true },
        { id: 'b2', name: '外国2', isForeign: true },
      ],
      pits: [
        { id: 'p1', name: '外国3', isForeign: true },
        { id: 'p2', name: '外国4', isForeign: true },
        { id: 'p3', name: '外国5', isForeign: true },
      ],
      activeIds: ['b1', 'b2', 'p1', 'p2', 'p3']
    };

    const resultWithEmpty = validateForeignPlayerLimits(roster, {});
    expect(resultWithEmpty.limit).toBe(4);
    expect(resultWithEmpty.warningThreshold).toBe(3);
    expect(resultWithEmpty.errors[0]).toBe('外国人枠超過: 5/4');

    const resultWithUndefined = validateForeignPlayerLimits(roster, {
      roster: {
        foreignPlayers: { limit: undefined, warningThreshold: undefined }
      }
    });
    expect(resultWithUndefined.limit).toBe(4);
    expect(resultWithUndefined.warningThreshold).toBe(3);
    expect(resultWithUndefined.errors[0]).toBe('外国人枠超過: 5/4');
  });

  it('normalizeRules preserves explicit interleague disable flag', () => {
    const rules = normalizeRules({
      interleague: { enabled: false, rounds: 3 }
    });

    expect(rules.interleague.enabled).toBe(false);
    expect(rules.interleague.rounds).toBe(3);
  });
});
