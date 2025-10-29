const DEFAULT_STADIUM_CAPACITY = 42000;
const DEFAULT_TICKET_PRICE = 3200;

const DEFAULT_FAN_STATE = Object.freeze({
  size: 26000,
  happiness: 55,
  loyalty: 50,
  lastAttendance: 0,
  capacity: DEFAULT_STADIUM_CAPACITY,
  ticketPrice: DEFAULT_TICKET_PRICE
});

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export function normalizeFanState(state = {}) {
  const base = { ...DEFAULT_FAN_STATE, ...(state || {}) };
  const size = clamp(Math.round(toNumber(base.size, DEFAULT_FAN_STATE.size)), 5000, 160000);
  const happiness = clamp(Math.round(toNumber(base.happiness, DEFAULT_FAN_STATE.happiness)), 0, 100);
  const loyalty = clamp(Math.round(toNumber(base.loyalty, DEFAULT_FAN_STATE.loyalty)), 0, 100);
  const lastAttendance = clamp(Math.round(toNumber(base.lastAttendance, 0)), 0, 200000);
  const capacity = clamp(Math.round(toNumber(base.capacity, DEFAULT_STADIUM_CAPACITY)), 10000, 200000);
  const ticketPrice = clamp(Math.round(toNumber(base.ticketPrice, DEFAULT_TICKET_PRICE)), 500, 20000);
  return {
    size,
    happiness,
    loyalty,
    lastAttendance,
    capacity,
    ticketPrice
  };
}

export function ensureTeamFans(state, tid, overrides = {}) {
  const normalizedOverrides = normalizeFanState(overrides);
  if (!state || typeof state !== 'object') {
    return normalizedOverrides;
  }
  if (!state.teamFans || typeof state.teamFans !== 'object') {
    state.teamFans = {};
  }
  const existing = state.teamFans[tid];
  if (!existing) {
    state.teamFans[tid] = normalizedOverrides;
    return state.teamFans[tid];
  }
  const merged = normalizeFanState({ ...existing, ...overrides });
  state.teamFans[tid] = merged;
  return merged;
}

export function updateFansFromPopularity(fans, { popularity, popularityDelta = 0 } = {}) {
  const current = normalizeFanState(fans);
  const popScore = clamp(toNumber(popularity, 60), 0, 100);
  const delta = Number.isFinite(popularityDelta) ? popularityDelta : 0;

  const happinessShift = delta * 1.1 + (popScore - 55) * 0.08;
  const loyaltyShift = delta * 0.4 + (popScore - 50) * 0.05;
  const growthFactor = 1 + delta * 0.015 + (happinessShift >= 0 ? happinessShift * 0.005 : 0);

  const next = {
    ...current,
    happiness: clamp(current.happiness + happinessShift, 5, 100),
    loyalty: clamp(current.loyalty + loyaltyShift, 5, 100)
  };
  next.size = clamp(Math.round(current.size * growthFactor + popScore * 35), 8000, 200000);
  return next;
}

export function projectAttendance(fans, finance, { popularity } = {}) {
  const fanState = normalizeFanState(fans);
  const capacity = clamp(
    toNumber(finance?.attendance?.capacity, fanState.capacity),
    10000,
    200000
  );
  const ticketPrice = clamp(
    toNumber(finance?.ticketPrice, fanState.ticketPrice),
    500,
    20000
  );
  const popScore = clamp(toNumber(popularity, 60), 0, 100);
  const interestFactor = 0.45 + popScore / 220;
  const happinessFactor = 0.6 + fanState.happiness / 150;
  const loyaltyFactor = 0.6 + fanState.loyalty / 220;
  const demandBase = Math.min(fanState.size, capacity) * interestFactor;
  const attendance = clamp(Math.round(Math.min(capacity, demandBase * happinessFactor * loyaltyFactor)), 0, capacity);
  const ticketRevenue = Math.round(attendance * ticketPrice);
  return { attendance, ticketRevenue, capacity, ticketPrice };
}

export function applyAttendanceToFinance(finance, attendance, ticketRevenue) {
  if (!finance || typeof finance !== 'object') return null;
  const ticket = Math.round(toNumber(ticketRevenue, 0));
  const attendanceTotal = Math.round(toNumber(attendance, 0));

  const attendanceState = { ...(finance.attendance || {}) };
  attendanceState.lastGame = attendanceTotal;
  attendanceState.seasonTotal = toNumber(attendanceState.seasonTotal, 0) + attendanceTotal;
  attendanceState.homeGames = toNumber(attendanceState.homeGames, 0) + 1;
  attendanceState.capacity = attendanceState.capacity || finance.attendance?.capacity || DEFAULT_STADIUM_CAPACITY;
  attendanceState.average = attendanceState.homeGames > 0
    ? Math.round(attendanceState.seasonTotal / attendanceState.homeGames)
    : attendanceTotal;
  attendanceState.forecast = Math.round(attendanceState.average * 72);
  finance.attendance = attendanceState;

  const revenue = { ...(finance.revenue || {}) };
  revenue.ticket = toNumber(revenue.ticket, 0) + ticket;
  revenue.total = toNumber(revenue.ticket, 0) + toNumber(revenue.merch, 0) + toNumber(revenue.media, 0) + toNumber(revenue.other, 0);
  finance.revenue = revenue;

  return { attendance: attendanceState, revenue };
}

export function updateTeamFansFromPopularity(state, tid, { popularity, popularityDelta = 0 } = {}) {
  if (!state || typeof state !== 'object') return null;
  const finance = state.teamFinances?.[tid];
  const fans = ensureTeamFans(state, tid, {
    capacity: finance?.attendance?.capacity,
    ticketPrice: finance?.ticketPrice
  });
  const nextFans = updateFansFromPopularity(fans, { popularity, popularityDelta });
  state.teamFans[tid] = nextFans;
  const turnout = projectAttendance(nextFans, finance, { popularity });
  if (finance) {
    applyAttendanceToFinance(finance, turnout.attendance, turnout.ticketRevenue);
    finance.popularity = clamp(toNumber(popularity, finance.popularity ?? 60), 0, 100);
  }
  nextFans.lastAttendance = turnout.attendance;
  nextFans.capacity = turnout.capacity;
  nextFans.ticketPrice = turnout.ticketPrice;
  return {
    fans: nextFans,
    attendance: turnout.attendance,
    ticketRevenue: turnout.ticketRevenue
  };
}

export {
  DEFAULT_FAN_STATE,
  DEFAULT_STADIUM_CAPACITY,
  DEFAULT_TICKET_PRICE
};
