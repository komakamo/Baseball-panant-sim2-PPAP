const FACILITY_TYPES = Object.freeze([
  {
    id: 'gym',
    key: 'gym',
    label: 'トレーニングジム',
    description: 'フィジカル強化でパワー/球威/体力の伸びを底上げする施設。'
  },
  {
    id: 'video',
    key: 'video',
    label: 'ビデオ・ラボ',
    description: '映像分析でコンタクト/選球/制球/変化/守備の成長を促す施設。'
  },
  {
    id: 'medical',
    key: 'medical',
    label: 'メディカルセンター',
    description: '疲労回復と故障リスク軽減を担うメディカル投資。'
  }
]);

export const FACILITY_TYPE_MAP = new Map(FACILITY_TYPES.map(type => [type.id, type]));

export const DEFAULT_FACILITY_LEVELS = Object.freeze({ gym: 0, video: 0, medical: 0 });

const facilityStore = new Map();

function sanitizeLevel(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export function createFacilityLevels(overrides = {}) {
  const base = { ...DEFAULT_FACILITY_LEVELS };
  if (overrides && typeof overrides === 'object') {
    const source = { ...overrides };
    if (source.recovery != null && source.medical == null) {
      source.medical = source.recovery;
    }
    for (const key of Object.keys(base)) {
      base[key] = sanitizeLevel(source[key]);
    }
  }
  base.recovery = base.medical;
  return base;
}

export function normalizeFacilityLevels(levels = {}) {
  return createFacilityLevels(levels);
}

export function ensureTeamFacilities(meta = {}, tid, overrides) {
  if (!meta || typeof meta !== 'object') {
    return createFacilityLevels(overrides);
  }
  const merged = {
    ...(meta.facilities || {}),
    ...(overrides || {})
  };
  const normalized = createFacilityLevels(merged);
  meta.facilities = normalized;
  if (Number.isFinite(tid)) {
    facilityStore.set(tid, normalized);
  }
  return normalized;
}

export function getTeamFacilities(tid) {
  if (!facilityStore.has(tid)) {
    facilityStore.set(tid, createFacilityLevels());
  }
  return facilityStore.get(tid);
}

export function updateTeamFacilities(tid, updater) {
  const current = { ...createFacilityLevels(getTeamFacilities(tid)) };
  let next = current;
  if (typeof updater === 'function') {
    next = createFacilityLevels(updater({ ...current }));
  } else if (updater && typeof updater === 'object') {
    next = createFacilityLevels({ ...current, ...updater });
  }
  facilityStore.set(tid, next);
  return next;
}

export function computeFacilityAdjustments(levels = {}) {
  const normalized = createFacilityLevels(levels);
  const { gym, video, medical } = normalized;

  const growth = {
    global: 1,
    battingPrecision: 1 + video * 0.02,
    battingPower: 1 + gym * 0.02,
    speed: 1 + gym * 0.015,
    pitchingCommand: 1 + video * 0.02,
    pitchingPower: 1 + gym * 0.02,
    stamina: 1 + gym * 0.02
  };

  const recovery = {
    mult: 1 + medical * 0.02,
    flat: medical * 6
  };

  const injuryRate = Math.max(0.5, 1 - medical * 0.06);
  const injuryDuration = Math.max(0.6, 1 - medical * 0.05);
  const specialAwaken = 1 + video * 0.015;

  return {
    levels: normalized,
    growth,
    recovery,
    injuryRate,
    injuryDuration,
    specialAwaken
  };
}

export function getFacilityStore() {
  return facilityStore;
}

export default FACILITY_TYPES;
