import { TRIGGER_TYPES } from '../../systems/sponsors.js';

const DEFAULT_SERIES_LENGTH = 12;

function defaultCreateElement(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([key, value]) => {
    if (value == null) return;
    if (key === 'class') node.className = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'text') node.textContent = value;
    else node.setAttribute(key, value);
  });
  children.forEach(child => node.append(child));
  return node;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function formatYen(value) {
  const amount = Math.round(toNumber(value, 0));
  return `¥${amount.toLocaleString('ja-JP')}`;
}

function formatPercent(value, decimals = 0) {
  if (!Number.isFinite(value)) return '—';
  return `${value.toFixed(decimals)}%`;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function computeAttendanceSeries(state, teamId, { computeAttendanceForGame, seriesLength = DEFAULT_SERIES_LENGTH } = {}) {
  const finance = state.teamFinances?.[teamId];
  if (!finance) {
    return { series: [], labels: [], average: 0, fillRate: null, capacity: 0 };
  }

  const stageStart = toNumber(state.seasonInfo?.stageBounds?.AS?.start, null);
  const results = Array.isArray(state.results) ? state.results : [];
  const entries = [];

  results.forEach(result => {
    if (!result || result.home_id !== teamId) return;
    if (stageStart != null && toNumber(result.day, 0) < stageStart) return;
    let attendance = toNumber(result.attendance, NaN);
    if (!Number.isFinite(attendance) && typeof computeAttendanceForGame === 'function') {
      attendance = toNumber(computeAttendanceForGame(state, result), NaN);
    }
    if (!Number.isFinite(attendance)) return;
    entries.push({
      day: toNumber(result.day, entries.length + 1),
      attendance
    });
  });

  if (!entries.length) {
    return { series: [], labels: [], average: toNumber(finance.attendance?.average, 0), fillRate: null, capacity: toNumber(finance.attendance?.capacity, 0) };
  }

  entries.sort((a, b) => a.day - b.day);
  const trimmed = entries.slice(-Math.max(2, seriesLength));
  const series = trimmed.map(entry => entry.attendance);
  const labels = trimmed.map(entry => `Day ${entry.day}`);
  const total = series.reduce((sum, value) => sum + value, 0);
  const average = Math.round(total / series.length);
  const capacity = toNumber(finance.attendance?.capacity, 0);
  const fillRate = capacity > 0 ? clamp((average / capacity) * 100, 0, 200) : null;

  return {
    series,
    labels,
    average,
    latest: series[series.length - 1] ?? null,
    capacity,
    fillRate
  };
}

function describeTriggerStatus(trigger, progress) {
  const metrics = progress?.metrics || {};
  const triggeredMap = progress?.triggered || {};
  const triggered = !!triggeredMap[trigger.id];
  const threshold = toNumber(trigger.threshold, null);
  let status = triggered ? '達成済み' : '未達成';

  if (!triggered) {
    if (trigger.type === TRIGGER_TYPES.WINS && Number.isFinite(threshold)) {
      const wins = toNumber(metrics.wins, 0);
      const remaining = Math.max(0, threshold - wins);
      status = remaining === 0 ? '条件達成待ち' : `あと${remaining}勝`;
    } else if (trigger.type === TRIGGER_TYPES.STAGE && trigger.stage) {
      status = 'ステージ進出待ち';
    }
  }

  const label = trigger.description || (() => {
    if (trigger.type === TRIGGER_TYPES.WINS) return `${threshold ?? '?'}勝ボーナス`;
    if (trigger.type === TRIGGER_TYPES.STAGE) return 'ステージボーナス';
    if (trigger.type === TRIGGER_TYPES.STAT) return '成績ボーナス';
    return 'ボーナス';
  })();

  return {
    triggered,
    label,
    status,
    payout: toNumber(trigger.payout, 0)
  };
}

export function createFinanceView({
  createElement = defaultCreateElement,
  getState = () => ({}),
  ensureTeamFinances = null,
  ensureTeamFans = null,
  ensureSponsorDeals = null,
  millionFormatter = value => `¥${(toNumber(value, 0) / 1000000).toFixed(1)}M`,
  yenFormatter = new Intl.NumberFormat('ja-JP'),
  createSparklineWithTooltip = null,
  createSparklineSVG = null,
  computeAttendanceForGame = null,
  refreshIcons = () => {},
} = {}) {
  function ensureStatePrerequisites(state, teamId) {
    if (typeof ensureTeamFinances === 'function') {
      ensureTeamFinances();
    }
    if (typeof ensureTeamFans === 'function') {
      ensureTeamFans(state, teamId);
    }
    if (typeof ensureSponsorDeals === 'function') {
      ensureSponsorDeals(state, teamId);
    }
  }

  function buildTicketRevenueCard(state, teamId) {
    const finance = state.teamFinances?.[teamId];
    const fans = state.teamFans?.[teamId];
    if (!finance) {
      return createElement('section', { class: 'front-office-card' },
        createElement('div', { class: 'front-office-card-header' },
          createElement('h3', {}, createElement('i', { 'data-lucide': 'ticket', class: 'mini-icon' }), 'チケット収益')
        ),
        createElement('div', { class: 'front-office-empty mini' }, '財務データが見つかりません。')
      );
    }

    const revenue = toNumber(finance.revenue?.ticket, 0);
    const games = toNumber(finance.attendance?.homeGames, 0);
    const perGame = games > 0 ? Math.round(revenue / games) : revenue;
    const avgAttendance = toNumber(finance.attendance?.average, fans?.lastAttendance ?? 0);
    const ticketPrice = toNumber(finance.ticketPrice ?? fans?.ticketPrice, 0);
    const fanSize = toNumber(fans?.size, 0);
    const happiness = toNumber(fans?.happiness, null);
    const loyalty = toNumber(fans?.loyalty, null);

    const card = createElement('section', { class: 'front-office-card finance-ticket-card' });
    card.append(
      createElement('div', { class: 'front-office-card-header' },
        createElement('h3', {},
          createElement('i', { 'data-lucide': 'ticket', class: 'mini-icon' }),
          'チケット収益'
        ),
        createElement('span', { class: 'pill' }, millionFormatter(revenue))
      )
    );

    card.append(
      createElement('div', { class: 'finance-stat' },
        createElement('span', {}, '平均入場者'),
        createElement('strong', {}, `${yenFormatter.format(avgAttendance)} 人`)
      ),
      createElement('div', { class: 'finance-stat' },
        createElement('span', {}, '平均単価'),
        createElement('strong', {}, formatYen(ticketPrice))
      ),
      createElement('div', { class: 'finance-stat' },
        createElement('span', {}, '試合平均収入'),
        createElement('strong', {}, millionFormatter(perGame))
      ),
      createElement('div', { class: 'finance-stat' },
        createElement('span', {}, 'ファン規模'),
        createElement('strong', {}, `${yenFormatter.format(fanSize)} 人`)
      )
    );

    if (happiness != null || loyalty != null) {
      const meta = createElement('div', { class: 'mini', style: 'color:var(--text-secondary);' });
      const parts = [];
      if (happiness != null) parts.push(`幸福度 ${happiness}`);
      if (loyalty != null) parts.push(`ロイヤルティ ${loyalty}`);
      if (parts.length) meta.append(parts.join(' ／ '));
      card.append(meta);
    }

    return card;
  }

  function buildAttendanceTrendCard(state, teamId) {
    const finance = state.teamFinances?.[teamId];
    if (!finance) return null;
    const trend = computeAttendanceSeries(state, teamId, { computeAttendanceForGame });
    const card = createElement('section', { class: 'front-office-card finance-attendance-card' });
    card.append(
      createElement('div', { class: 'front-office-card-header' },
        createElement('h3', {},
          createElement('i', { 'data-lucide': 'line-chart', class: 'mini-icon' }),
          '観客トレンド (AS以降)'
        ),
        createElement('span', { class: 'pill' }, `${yenFormatter.format(trend.average || finance.attendance?.average || 0)} 人`)
      )
    );

    if (trend.series.length >= 2) {
      let chartNode = null;
      if (typeof createSparklineWithTooltip === 'function') {
        chartNode = createSparklineWithTooltip(trend.series, trend.labels, 'var(--primary)', 220, 44, value => `${yenFormatter.format(Math.round(value))} 人`);
      } else if (typeof createSparklineSVG === 'function') {
        chartNode = createSparklineSVG(trend.series, 'var(--primary)', 220, 44);
      }
      if (chartNode) {
        card.append(createElement('div', { class: 'mini', style: 'display:flex;flex-direction:column;gap:8px;' }, chartNode));
      }
    } else {
      card.append(createElement('div', { class: 'front-office-empty mini' }, 'AS以降の主催試合データが不足しています。'));
    }

    const fillRate = trend.fillRate != null ? formatPercent(trend.fillRate) : '—';
    card.append(
      createElement('div', { class: 'finance-stat' },
        createElement('span', {}, '最新動員'),
        createElement('strong', {}, `${yenFormatter.format(trend.latest ?? finance.attendance?.lastGame ?? 0)} 人`)
      ),
      createElement('div', { class: 'finance-stat' },
        createElement('span', {}, '収容率'),
        createElement('strong', {}, fillRate)
      )
    );

    return card;
  }

  function buildSponsorCard(state, teamId) {
    const sponsorState = state.teamSponsors?.[teamId];
    const deals = Array.isArray(sponsorState?.deals) ? sponsorState.deals : [];
    const card = createElement('section', { class: 'front-office-card finance-sponsor-card' });
    card.append(
      createElement('div', { class: 'front-office-card-header' },
        createElement('h3', {},
          createElement('i', { 'data-lucide': 'handshake', class: 'mini-icon' }),
          'スポンサー進捗'
        ),
        createElement('span', { class: 'pill' }, deals.length ? `${deals.length} 件` : '契約未設定')
      )
    );

    if (!deals.length) {
      card.append(createElement('div', { class: 'front-office-empty mini' }, '進行中のスポンサー契約がありません。'));
      return card;
    }

    deals.forEach(deal => {
      const progress = deal.progress || {};
      const baseAwarded = !!progress.baseAwarded;
      const dealBlock = createElement('article', { class: 'finance-sponsor-entry' });
      dealBlock.append(
        createElement('h4', { class: 'mini', style: 'margin:0;display:flex;justify-content:space-between;gap:8px;' },
          createElement('span', {}, deal.name || 'スポンサー契約'),
          createElement('span', { class: `pill ${baseAwarded ? 'positive' : ''}` }, baseAwarded ? '基本保証受領済み' : '基本保証未受領')
        )
      );

      if (deal.base?.summary) {
        dealBlock.append(createElement('div', { class: 'mini', style: 'color:var(--text-secondary);' }, deal.base.summary));
      }

      if (toNumber(deal.base?.amount, 0) > 0) {
        dealBlock.append(
          createElement('div', { class: 'finance-stat' },
            createElement('span', {}, '基本保証'),
            createElement('strong', {}, formatYen(deal.base.amount))
          )
        );
      }

      if (Array.isArray(deal.bonusTriggers) && deal.bonusTriggers.length) {
        deal.bonusTriggers.forEach(trigger => {
          const status = describeTriggerStatus(trigger, progress);
          const row = createElement('div', { class: 'finance-stat' },
            createElement('span', {}, status.label),
            createElement('strong', {}, formatYen(status.payout))
          );
          dealBlock.append(row);
          dealBlock.append(createElement('div', { class: 'mini', style: 'margin-top:-6px;color:var(--text-secondary);' }, status.status));
        });
      }

      card.append(dealBlock);
    });

    return card;
  }

  function render({ container, teamId }) {
    const state = getState();
    ensureStatePrerequisites(state, teamId);
    const cards = [
      buildTicketRevenueCard(state, teamId),
      buildAttendanceTrendCard(state, teamId),
      buildSponsorCard(state, teamId)
    ].filter(Boolean);
    cards.forEach(card => container.append(card));
    refreshIcons();
  }

  return { render };
}

export default createFinanceView;
