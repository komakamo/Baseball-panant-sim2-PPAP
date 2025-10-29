const STAFF_TYPES = Object.freeze([
  {
    id: 'hit',
    key: 'hit',
    label: '打撃コーチ',
    category: 'batting',
    description: '打撃能力の成長と特能の覚醒を促すスタッフ。'
  },
  {
    id: 'pit',
    key: 'pit',
    label: '投手コーチ',
    category: 'pitching',
    description: '投手能力の成長と特能の覚醒を支えるスタッフ。'
  },
  {
    id: 'cond',
    key: 'cond',
    label: 'コンディショニング',
    category: 'conditioning',
    description: '全体の成長効率・回復力・故障耐性を底上げするスタッフ。'
  }
]);

export const STAFF_TYPE_MAP = new Map(STAFF_TYPES.map(type => [type.id, type]));

export const DEFAULT_STAFF_LEVELS = Object.freeze({ hit: 0, pit: 0, cond: 0 });

function sanitizeLevel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export function createStaffLevels(overrides = {}) {
  const base = { ...DEFAULT_STAFF_LEVELS };
  if (!overrides || typeof overrides !== 'object') {
    return { ...base };
  }
  for (const key of Object.keys(base)) {
    base[key] = sanitizeLevel(overrides[key]);
  }
  return base;
}

export function normalizeStaffLevels(levels = {}) {
  return createStaffLevels(levels);
}

export function ensureTeamStaff(meta = {}, overrides) {
  if (!meta || typeof meta !== 'object') {
    return createStaffLevels(overrides);
  }
  const merged = {
    ...(meta.coaches || {}),
    ...(overrides || {})
  };
  const normalized = createStaffLevels(merged);
  meta.coaches = normalized;
  return normalized;
}

export function computeStaffAdjustments(levels = {}) {
  const normalized = createStaffLevels(levels);
  const hit = normalized.hit;
  const pit = normalized.pit;
  const cond = normalized.cond;

  const growth = {
    global: 1 + cond * 0.01,
    hitting: 1 + hit * 0.03,
    pitching: 1 + pit * 0.03
  };

  const recovery = {
    mult: 1 + cond * 0.015,
    flat: cond * 1.5
  };

  const injuryRate = Math.max(0.6, 1 - cond * 0.04);
  const injuryDuration = Math.max(0.75, 1 - cond * 0.03);
  const specialAwaken = 1 + (hit + pit) * 0.015 + cond * 0.01;

  return {
    levels: normalized,
    growth,
    recovery,
    injuryRate,
    injuryDuration,
    specialAwaken
  };
}

export function getStaffType(id) {
  return STAFF_TYPE_MAP.get(id) || null;
}

export default STAFF_TYPES;
