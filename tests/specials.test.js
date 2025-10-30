import { createPlateAppearanceSpecialEngine, initializeSpecials } from '../src/systems/specials.js';
import * as fs from 'fs';
import * as path from 'path';

const makeContext = (bases = [null, null, null]) => ({
  inning: 1,
  half: 'top',
  outs: 0,
  bases,
  scoreBefore: { home: 0, away: 0 },
  battingTeam: { side: 'away' },
  defTeam: { side: 'home' }
});

describe('specials', () => {
  beforeAll(() => {
    const specialsPath = path.resolve(__dirname, '../data/specials.json');
    const specialsData = JSON.parse(fs.readFileSync(specialsPath, 'utf-8'));
    initializeSpecials(specialsData);
  });
  it('lefty_killer triggers only against left-handed pitchers and respects usage cap', () => {
    const engine = createPlateAppearanceSpecialEngine();
    const batter = { id: 'bat1', name: 'Lefty Crusher', hand: 'R', traits: ['lefty_killer'] };
    const leftyPitcher = { id: 'pitL', name: 'Southpaw', hand: 'L', traits: [] };
    const rightyPitcher = { id: 'pitR', name: 'Righty', hand: 'R', traits: [] };

    const first = engine.evaluate({ batter, pitcher: leftyPitcher, context: makeContext() });
    expect(first).toBeDefined();
    expect(first.triggered[0].id).toBe('lefty_killer');
    expect(first.adjustments.hitProb.add).toBeGreaterThan(0);
    const maxUses = first.triggered[0].max || 0;

    for (let i = 1; i < maxUses; i++) {
      const follow = engine.evaluate({ batter, pitcher: leftyPitcher, context: makeContext() });
      expect(follow).toBeDefined();
    }
    const beyond = engine.evaluate({ batter, pitcher: leftyPitcher, context: makeContext() });
    expect(beyond).toBe(null);

    const versusRight = engine.evaluate({ batter, pitcher: rightyPitcher, context: makeContext() });
    expect(versusRight).toBe(null);
  });

  it('clutch_hitter only activates with runners in scoring position', () => {
    const engine = createPlateAppearanceSpecialEngine();
    const batter = { id: 'bat2', name: 'Clutch', hand: 'R', traits: ['clutch_hitter'] };
    const pitcher = { id: 'pit', name: 'Normal', hand: 'R', traits: [] };

    const noRisp = engine.evaluate({ batter, pitcher, context: makeContext([{ id: 'runner' }, null, null]) });
    expect(noRisp).toBe(null);

    const withRisp = engine.evaluate({ batter, pitcher, context: makeContext([null, { id: 'runner2' }, null]) });
    expect(withRisp).toBeDefined();
    expect(withRisp.triggered[0].id).toBe('clutch_hitter');
  });

  it('strikeout_machine boosts strike probability and reduces hits', () => {
    const engine = createPlateAppearanceSpecialEngine();
    const pitcher = { id: 'pitS', name: 'Strikeout Ace', hand: 'R', traits: ['strikeout_machine'] };
    const batter = { id: 'bat3', name: 'Batter', hand: 'L', traits: [] };

    const result = engine.evaluate({ batter, pitcher, context: makeContext() });
    expect(result).toBeDefined();
    expect(result.adjustments.strikeProb.add).toBeGreaterThan(0);
    expect(result.adjustments.hitProb.add).toBeLessThan(0);
    expect(result.commentary.some(line => line.includes('特能発動'))).toBe(true);
  });
});
