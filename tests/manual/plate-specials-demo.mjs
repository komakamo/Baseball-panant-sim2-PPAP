import { createPlateAppearanceSpecialEngine } from '../../src/systems/specials.js';

const makeContext = ({ inning = 1, half = 'top', outs = 0, bases = [null, null, null], scoreBefore = { home: 0, away: 0 }, battingSide = 'away' } = {}) => ({
  inning,
  half,
  outs,
  bases,
  scoreBefore,
  battingTeam: { side: battingSide },
  defTeam: { side: battingSide === 'home' ? 'away' : 'home' }
});

const logResult = (label, result) => {
  if (!result) {
    console.log(label, '→ 発動なし');
    return;
  }
  const names = result.triggered.map(entry => entry.summary || entry.name).join(' / ');
  const commentary = (result.commentary || []).join(' / ');
  console.log(label, '→', names, commentary ? `| ${commentary}` : '');
};

const engine = createPlateAppearanceSpecialEngine();
const demoBatter = { id: 'demo-bat', name: 'テスト打者', hand: 'R', traits: ['lefty_killer'] };
const lefty = { id: 'demo-left', name: '左腕', hand: 'L', traits: [] };
const righty = { id: 'demo-right', name: '右腕', hand: 'R', traits: [] };

console.log('--- 左投手対策（対左投手○）デモ ---');
for (let i = 1; i <= 4; i++) {
  const result = engine.evaluate({ batter: demoBatter, pitcher: lefty, context: makeContext() });
  logResult(`vs左腕 ${i}打席目`, result);
}
logResult('vs右腕 テスト', engine.evaluate({ batter: demoBatter, pitcher: righty, context: makeContext() }));

console.log('\n--- クラッチヒッター条件確認 ---');
const clutchEngine = createPlateAppearanceSpecialEngine();
const clutchBatter = { id: 'demo-clutch', name: 'チャンス打者', hand: 'R', traits: ['clutch_hitter'] };
const opponent = { id: 'demo-opp', name: '投手', hand: 'L', traits: [] };
const lateInning = makeContext({ inning: 8, half: 'bottom', outs: 1, battingSide: 'home' });
logResult('得点圏なし', clutchEngine.evaluate({ batter: clutchBatter, pitcher: opponent, context: lateInning }));
const risp = makeContext({ inning: 8, half: 'bottom', outs: 1, bases: [null, { id: 'runner2', name: '二塁走者' }, null], battingSide: 'home' });
logResult('得点圏あり', clutchEngine.evaluate({ batter: clutchBatter, pitcher: opponent, context: risp }));
