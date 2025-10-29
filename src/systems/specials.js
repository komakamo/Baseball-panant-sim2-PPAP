import rawSpecials from '../data/specials.json' assert { type: 'json' };

const normalizeWhenList = (when) => {
  if (!when) return [];
  return Array.isArray(when) ? when.slice() : [when];
};

const SPECIALS = rawSpecials.map(entry => ({
  ...entry,
  when: normalizeWhenList(entry.when),
  effect: { ...(entry.effect || {}) }
}));

const SPECIALS_BY_ID = new Map();
const SPECIAL_IDS_BY_NAME = new Map();

for (const special of SPECIALS) {
  SPECIALS_BY_ID.set(special.id, special);
  if (special.name) {
    SPECIAL_IDS_BY_NAME.set(special.name, special.id);
  }
}

const STACK_RULES = Object.freeze({
  sum: 'sum',
  multiply: 'multiply',
  max: 'max'
});

function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function matchesWhen(whenList, contexts) {
  if (!whenList || whenList.length === 0) return true;
  const ctxList = contexts.length ? contexts : ['default'];
  return whenList.some(cond => ctxList.includes(cond));
}

function resolveStackRule(stackRule, key) {
  if (!stackRule) return STACK_RULES.sum;
  if (typeof stackRule === 'string') return stackRule;
  if (typeof stackRule === 'object') {
    if (stackRule[key]) return stackRule[key];
    if (stackRule.default) return stackRule.default;
  }
  return STACK_RULES.sum;
}

function applyEffectTotals(target, effect, stackRule) {
  if (!effect) return target;
  for (const [key, value] of Object.entries(effect)) {
    if (value == null) continue;
    const rule = resolveStackRule(stackRule, key);
    if (rule === STACK_RULES.multiply) {
      const current = key in target ? target[key] : 1;
      target[key] = current * value;
    } else if (rule === STACK_RULES.max) {
      const current = key in target ? target[key] : Number.NEGATIVE_INFINITY;
      target[key] = Math.max(current, value);
    } else {
      const current = key in target ? target[key] : 0;
      target[key] = current + value;
    }
  }
  return target;
}

export function listSpecials() {
  return SPECIALS.slice();
}

export function getSpecialById(id) {
  return id ? SPECIALS_BY_ID.get(id) || null : null;
}

export function findSpecialId(identifier) {
  if (!identifier) return null;
  if (SPECIALS_BY_ID.has(identifier)) return identifier;
  return SPECIAL_IDS_BY_NAME.get(identifier) || null;
}

export function normalizePlayerSpecials(player) {
  if (!player) return [];
  const raw = Array.isArray(player.traits) ? player.traits : [];
  const deduped = [];
  const seen = new Set();
  raw.forEach(token => {
    const id = findSpecialId(token);
    if (!id || seen.has(id)) return;
    seen.add(id);
    deduped.push(id);
  });
  player.traits = deduped;
  return deduped;
}

export function playerHasSpecial(player, identifier) {
  const id = findSpecialId(identifier);
  if (!id) return false;
  const traits = Array.isArray(player?.traits) ? player.traits : [];
  return traits.includes(id);
}

export function applySpecialEffects(traitIds, context, target = {}) {
  const contexts = toArray(context);
  const totals = target;
  const ids = Array.isArray(traitIds) ? traitIds : [];
  ids.forEach(rawId => {
    const id = findSpecialId(rawId);
    if (!id) return;
    const special = SPECIALS_BY_ID.get(id);
    if (!special) return;
    if (!matchesWhen(special.when, contexts)) return;
    applyEffectTotals(totals, special.effect, special.stackRule);
  });
  return totals;
}

export function collectPlayerEffects(players, context, target = {}) {
  const totals = target;
  players.forEach(player => {
    const traits = normalizePlayerSpecials(player || {});
    applySpecialEffects(traits, context, totals);
  });
  return totals;
}

export function getPlayerEffects(player, context) {
  const traits = normalizePlayerSpecials(player || {});
  return applySpecialEffects(traits, context, {});
}

const PROBABILITY_KEYS = ['walkProb', 'strikeProb', 'hrProb', 'hitProb'];

const PROBABILITY_KEY_SET = new Set(PROBABILITY_KEYS);

const createEmptyAdjustments = () => PROBABILITY_KEYS.reduce((acc, key) => {
  acc[key] = { add: 0, mult: 1 };
  return acc;
}, {});

const mergeProbabilityEffects = (adjustments, effects = {}) => {
  if (!effects) return adjustments;
  for (const [key, config] of Object.entries(effects)) {
    if (!PROBABILITY_KEY_SET.has(key)) continue;
    const slot = adjustments[key];
    if (typeof config === 'number') {
      slot.add += config;
      continue;
    }
    if (config && typeof config === 'object') {
      if (typeof config.add === 'number') slot.add += config.add;
      if (typeof config.mult === 'number') slot.mult *= config.mult;
    }
  }
  return adjustments;
};

const PLATE_SPECIAL_RULES = [
  {
    traitId: 'plate_discipline',
    target: 'batter',
    max: 3,
    effects: {
      walkProb: { add: 0.012 },
      strikeProb: { add: -0.008 }
    },
    summary: ({ player, special }) => `${player.name}の${special?.name ?? '特能'}が冴える`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'contact_master',
    target: 'batter',
    max: 3,
    effects: {
      hitProb: { add: 0.025 },
      strikeProb: { add: -0.005 }
    },
    summary: ({ special }) => `${special?.name ?? '特能'}でバットコントロール向上`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'slugger_elite',
    target: 'batter',
    max: 2,
    effects: {
      hrProb: { add: 0.015 },
      hitProb: { add: 0.01 }
    },
    summary: ({ player, special }) => `${player.name}の${special?.name ?? '特能'}が長打を後押し`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'speedster',
    target: 'batter',
    max: 2,
    condition: ({ context }) => context.outs < 2 && !context.hasRISP,
    effects: {
      hitProb: { add: 0.012 },
      strikeProb: { add: -0.004 }
    },
    summary: ({ player, special }) => `${player.name}が${special?.name ?? '特能'}で内野安打を狙う`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'clutch_hitter',
    target: 'batter',
    max: 3,
    condition: ({ context }) => context.hasRISP || context.highLeverage,
    effects: {
      hitProb: { add: 0.025 },
      hrProb: { add: 0.01 }
    },
    summary: ({ player, special }) => `${player.name}の${special?.name ?? '特能'}がチャンスで炸裂`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'lefty_killer',
    target: 'batter',
    max: 3,
    condition: ({ context }) => context.pitcherHand === 'L',
    effects: {
      hitProb: { add: 0.02 },
      hrProb: { add: 0.012 },
      strikeProb: { add: -0.01 }
    },
    summary: ({ player, special }) => `${player.name}が${special?.name ?? '特能'}で左腕攻略`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'strikeout_machine',
    target: 'pitcher',
    max: 3,
    effects: {
      strikeProb: { add: 0.02 },
      hitProb: { add: -0.015 }
    },
    summary: ({ player, special }) => `${player.name}の${special?.name ?? '特能'}で空振りを量産`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'precision_pitcher',
    target: 'pitcher',
    max: 4,
    effects: {
      walkProb: { add: -0.015 },
      strikeProb: { add: 0.01 }
    },
    summary: ({ player, special }) => `${player.name}が${special?.name ?? '特能'}でコーナーを突く`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'power_pitcher',
    target: 'pitcher',
    max: 3,
    effects: {
      strikeProb: { add: 0.015 },
      hrProb: { add: -0.01 }
    },
    summary: ({ player, special }) => `${player.name}の${special?.name ?? '特能'}が力強い直球を生む`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  },
  {
    traitId: 'pitch_to_contact',
    target: 'pitcher',
    max: 3,
    condition: ({ context }) => context.baseRunners > 0 || context.outs < 2,
    effects: {
      hitProb: { add: -0.015 },
      hrProb: { add: -0.008 },
      walkProb: { add: -0.005 }
    },
    summary: ({ player, special }) => `${player.name}が${special?.name ?? '特能'}で打たせて取る`,
    commentary: ({ special }) => `特能発動: ${special?.name ?? '特能'}`
  }
];

const PLATE_SPECIAL_RULE_MAP = new Map(PLATE_SPECIAL_RULES.map(rule => [rule.traitId, rule]));

function buildPlateContext({ context = {}, batter = null, pitcher = null, batterStats = null, pitcherStats = null }) {
  const bases = Array.isArray(context?.bases) ? context.bases : [];
  const safeBases = [bases[0] ?? null, bases[1] ?? null, bases[2] ?? null];
  const hasRISP = Boolean(safeBases[1] || safeBases[2]);
  const baseRunners = safeBases.filter(Boolean).length;
  const inning = Number.isFinite(context?.inning) ? context.inning : 1;
  const half = context?.half || 'top';
  const outs = Number.isFinite(context?.outs) ? context.outs : 0;
  const scoreBefore = context?.scoreBefore || context?.scoreboard || { home: 0, away: 0 };
  const battingSide = context?.battingTeam?.side || (half === 'top' ? 'away' : 'home');
  const defSide = battingSide === 'home' ? 'away' : 'home';
  const scoreDiff = (scoreBefore?.[battingSide] ?? 0) - (scoreBefore?.[defSide] ?? 0);
  const highLeverage = inning >= 7 && Math.abs(scoreDiff) <= 2;
  const pitcherHand = pitcher?.hand || pitcher?.throwHand || pitcher?.raw?.hand || 'R';
  const batterHand = batter?.hand || batter?.batHand || batter?.raw?.hand || 'R';
  return {
    inning,
    half,
    outs,
    bases: safeBases,
    baseRunners,
    hasRISP,
    scoreBefore,
    battingSide,
    defSide,
    scoreDiff,
    highLeverage,
    batterHand,
    pitcherHand,
    batterStats,
    pitcherStats
  };
}

export function createPlateAppearanceSpecialEngine(_options = {}) {
  const usage = new Map();
  const evaluate = ({ batter = null, pitcher = null, context = {}, batterStats = null, pitcherStats = null } = {}) => {
    const adjustments = createEmptyAdjustments();
    const triggered = [];
    const commentary = [];
    if (!batter && !pitcher) return null;
    const derivedContext = buildPlateContext({ context, batter, pitcher, batterStats, pitcherStats });

    const evaluatePlayer = (player, opponent, role) => {
      if (!player) return;
      const traits = normalizePlayerSpecials(player || {});
      if (!traits.length) return;
      traits.forEach(traitId => {
        const rule = PLATE_SPECIAL_RULE_MAP.get(traitId);
        if (!rule || rule.target !== role) return;
        const key = `${role}:${player.id ?? player.name ?? 'unknown'}:${traitId}`;
        const used = usage.get(key) || 0;
        if (rule.max != null && used >= rule.max) return;
        const special = getSpecialById(traitId);
        const payload = { player, opponent, special, context: derivedContext };
        if (typeof rule.condition === 'function' && !rule.condition(payload)) return;
        mergeProbabilityEffects(adjustments, rule.effects);
        const nextUse = used + 1;
        usage.set(key, nextUse);
        const entry = {
          id: traitId,
          target: role,
          name: special?.name || traitId,
          playerId: player.id ?? null,
          playerName: player.name ?? null,
          uses: nextUse,
          max: rule.max ?? null
        };
        const summary = typeof rule.summary === 'function' ? rule.summary(payload) : rule.summary;
        entry.summary = summary || `${entry.name}が発動`;
        if (rule.effects) entry.effects = rule.effects;
        const callout = typeof rule.commentary === 'function' ? rule.commentary(payload) : rule.commentary;
        commentary.push(callout || `特能発動: ${entry.name}`);
        triggered.push(entry);
      });
    };

    evaluatePlayer(batter, pitcher, 'batter');
    evaluatePlayer(pitcher, batter, 'pitcher');

    if (!triggered.length) return null;

    return { adjustments, triggered, commentary };
  };

  return {
    evaluate,
    reset: () => usage.clear(),
    getUsage: () => new Map(usage)
  };
}

export { SPECIALS };
