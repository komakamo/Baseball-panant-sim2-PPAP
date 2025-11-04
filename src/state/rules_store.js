import { normalizeRules, createDefaultRules } from '../core/rules.js';
import { getRulesetById } from '../rulesets.js';

let _currentRules = createDefaultRules();
let _listeners = [];

function broadcast() {
  for (const listener of _listeners) {
    try {
      listener(_currentRules);
    } catch (e) {
      console.error('Error in rules_store listener:', e);
    }
  }
}

export const rulesStore = {
  get() {
    return _currentRules;
  },

  set(newRules) {
    _currentRules = normalizeRules(newRules);
    broadcast();
  },

  updateFromRulesetId(rulesetId) {
    const ruleset = getRulesetById(rulesetId);
    if (ruleset) {
      const gameRules = { ...ruleset };
      this.set({ ..._currentRules, game: gameRules });
    }
  },

  subscribe(listener) {
    _listeners.push(listener);
    return function unsubscribe() {
      _listeners = _listeners.filter(l => l !== listener);
    };
  },
};

export default rulesStore;
