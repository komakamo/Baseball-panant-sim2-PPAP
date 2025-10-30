import { applyFarmEffects } from '../src/systems/farm.js';
import { normalizePlayerSpecials } from '../src/systems/specials.js';

function createMockPlayer(overrides = {}) {
    const player = {
        id: `P-TEST-${Math.random()}`,
        name: 'テスト選手',
        farmReveal: 0,
        fatigue: 50,
        injury: null,
        traits: [],
        farmLog: [],
        ...overrides,
    };
    normalizePlayerSpecials(player);
    return player;
}

describe('applyFarmEffects', () => {
  it('負傷した選手は育成ポイント（farmReveal）を獲得しない', () => {
    const injuredPlayer = createMockPlayer({
        injury: { type: '捻挫', duration: 10 },
        farmReveal: 10,
    });
    const state = {
        rosters: { '0': { bats: [], pits: [injuredPlayer] } },
        squads: { '0': { ichi: [], ni: [injuredPlayer.id] } },
    };

    applyFarmEffects(state, { teamId: '0' });

    expect(injuredPlayer.farmReveal).toBe(10);
  });

  it('負傷した選手は疲労回復しない', () => {
      const injuredPlayer = createMockPlayer({
          injury: { type: '打撲', duration: 5 },
          fatigue: 70,
      });
      const state = {
          rosters: { '0': { bats: [], pits: [injuredPlayer] } },
          squads: { '0': { ichi: [], ni: [injuredPlayer.id] } },
      };

      applyFarmEffects(state, { teamId: '0' });

      expect(injuredPlayer.fatigue).toBe(70);
  });

  it('健康な選手は育成ポイントと疲労回復効果を受ける', () => {
      const healthyPlayer = createMockPlayer({
          fatigue: 50,
          farmReveal: 20,
      });
      const state = {
          rosters: { '0': { bats: [healthyPlayer], pits: [] } },
          squads: { '0': { ichi: [], ni: [healthyPlayer.id] } },
      };

      applyFarmEffects(state, { teamId: '0' });

      expect(healthyPlayer.farmReveal).toBeGreaterThan(20);
      expect(healthyPlayer.fatigue).toBeLessThan(50);
  });

  it('should correctly calculate fatigue recovery', () => {
    const player = {
      id: 'p1',
      name: 'Player 1',
      fatigue: 50,
      stam: 60,
      spd: 60,
      farmReveal: 50,
    };

    const state = {
      squads: {
        t1: {
          ni: ['p1'],
        },
      },
      rosters: {
        t1: {
          bats: [player],
          pits: [],
        },
      },
    };

    const options = {
      teamId: 't1',
      days: 7,
      rng: () => 0.5,
    };

    const result = applyFarmEffects(state, options);
    const p1Result = result.players.find(p => p.playerId === 'p1');

    expect(p1Result.fatigueAfter).toBe(43);
  });
});
