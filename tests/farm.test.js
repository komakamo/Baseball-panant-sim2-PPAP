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

function runTest(name, testFn) {
    try {
        testFn();
        console.log(`✅ [SUCCESS] ${name}`);
        return { success: true, name };
    } catch (error) {
        console.error(`❌ [FAILURE] ${name}`);
        console.error(error);
        return { success: false, name, error: error.message };
    }
}

console.log('--- farm.js Tests ---');

runTest('負傷した選手は育成ポイント（farmReveal）を獲得しない', () => {
    const injuredPlayer = createMockPlayer({
        injury: { type: '捻挫', duration: 10 },
        farmReveal: 10,
    });
    const state = {
        rosters: { '0': { bats: [], pits: [injuredPlayer] } },
        squads: { '0': { ichi: [], ni: [injuredPlayer.id] } },
    };

    applyFarmEffects(state, { teamId: '0' });

    if (injuredPlayer.farmReveal !== 10) {
        throw new Error(`負傷した選手のfarmRevealが変化しました。期待値: 10, 結果: ${injuredPlayer.farmReveal}`);
    }
});

runTest('負傷した選手は疲労回復しない', () => {
    const injuredPlayer = createMockPlayer({
        injury: { type: '打撲', duration: 5 },
        fatigue: 70,
    });
    const state = {
        rosters: { '0': { bats: [], pits: [injuredPlayer] } },
        squads: { '0': { ichi: [], ni: [injuredPlayer.id] } },
    };

    applyFarmEffects(state, { teamId: '0' });

    if (injuredPlayer.fatigue !== 70) {
        throw new Error(`負傷した選手の疲労が変化しました。期待値: 70, 結果: ${injuredPlayer.fatigue}`);
    }
});

runTest('健康な選手は育成ポイントと疲労回復効果を受ける', () => {
    const healthyPlayer = createMockPlayer({
        fatigue: 50,
        farmReveal: 20,
    });
    const state = {
        rosters: { '0': { bats: [healthyPlayer], pits: [] } },
        squads: { '0': { ichi: [], ni: [healthyPlayer.id] } },
    };

    applyFarmEffects(state, { teamId: '0' });

    if (healthyPlayer.farmReveal <= 20) {
        throw new Error(`健康な選手のfarmRevealが増加しませんでした。開始時: 20, 結果: ${healthyPlayer.farmReveal}`);
    }
    if (healthyPlayer.fatigue >= 50) {
        throw new Error(`健康な選手の疲労が回復しませんでした。開始時: 50, 結果: ${healthyPlayer.fatigue}`);
    }
});
