const DEFAULT_BASE_CONFIG = Object.freeze({ amount: 0, summary: '' });

const TRIGGER_TYPES = Object.freeze({
  WINS: 'wins',
  STAGE: 'stage',
  STAT: 'stat',
  CUSTOM: 'custom'
});

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function createProgress(progress = {}) {
  return {
    baseAwarded: !!progress.baseAwarded,
    triggered: { ...(progress.triggered || {}) },
    metrics: { ...(progress.metrics || {}) },
    lastEvaluatedDay: progress.lastEvaluatedDay ?? null
  };
}

function normalizeTrigger(trigger, index, dealId) {
  if (!trigger || typeof trigger !== 'object') {
    return {
      id: `${dealId || 'deal'}-bonus-${index}`,
      type: TRIGGER_TYPES.WINS,
      threshold: 0,
      payout: 0,
      description: ''
    };
  }
  const id = trigger.id || `${dealId || 'deal'}-bonus-${index}`;
  const type = trigger.type || TRIGGER_TYPES.WINS;
  const threshold = trigger.threshold != null ? trigger.threshold : trigger.value;
  const payout = toNumber(trigger.payout, 0);
  const description = trigger.description || '';
  const stage = trigger.stage != null ? trigger.stage : trigger.stages;
  const stat = trigger.stat || trigger.metric || null;
  const once = trigger.once == null ? true : !!trigger.once;
  return {
    id,
    type,
    threshold,
    payout,
    description,
    stage,
    stat,
    once
  };
}

function normalizeDeal(deal, index) {
  if (!deal || typeof deal !== 'object') {
    return {
      id: `deal-${index}`,
      name: `スポンサー契約${index + 1}`,
      base: { ...DEFAULT_BASE_CONFIG },
      bonusTriggers: [],
      progress: createProgress()
    };
  }
  const id = deal.id || `deal-${index}`;
  const name = deal.name || `スポンサー契約${index + 1}`;
  const baseConfig = deal.base && typeof deal.base === 'object'
    ? deal.base
    : { amount: deal.base }; // allow shorthand number
  const baseAmount = toNumber(baseConfig?.amount, 0);
  const baseSummary = typeof baseConfig?.summary === 'string' ? baseConfig.summary : '';
  const bonusTriggers = Array.isArray(deal.bonusTriggers)
    ? deal.bonusTriggers.map((trigger, idx) => normalizeTrigger(trigger, idx, id))
    : [];
  const progress = createProgress(deal.progress);
  return {
    id,
    name,
    base: { amount: baseAmount, summary: baseSummary },
    bonusTriggers,
    progress
  };
}

function normalizeDeals(deals = []) {
  return deals.map((deal, idx) => normalizeDeal(deal, idx));
}

function ensureRevenueTotals(revenue) {
  if (!revenue || typeof revenue !== 'object') return;
  const ticket = toNumber(revenue.ticket, 0);
  const merch = toNumber(revenue.merch, 0);
  const media = toNumber(revenue.media, 0);
  const other = toNumber(revenue.other, 0);
  const sponsors = toNumber(revenue.sponsors, 0);
  revenue.total = ticket + merch + media + other + sponsors;
}

function formatCurrency(amount) {
  const value = Math.round(toNumber(amount, 0));
  return `¥${value.toLocaleString('en-US')}`;
}

function countTeamWins(results, tid) {
  if (!Array.isArray(results)) return 0;
  return results.reduce((total, result) => {
    if (!result) return total;
    if (result.winner_id === tid) return total + 1;
    if (result.home_id === tid && toNumber(result.home_runs, 0) > toNumber(result.away_runs, 0)) {
      return total + 1;
    }
    if (result.away_id === tid && toNumber(result.away_runs, 0) > toNumber(result.home_runs, 0)) {
      return total + 1;
    }
    return total;
  }, 0);
}

function ensureBudget(finance) {
  if (!finance || typeof finance !== 'object') return null;
  if (!finance.budget || typeof finance.budget !== 'object') {
    finance.budget = { reserves: 0 };
  }
  finance.budget.reserves = toNumber(finance.budget.reserves, 0);
  if (!finance.revenue || typeof finance.revenue !== 'object') {
    finance.revenue = {};
  }
  finance.revenue.sponsors = toNumber(finance.revenue.sponsors, 0);
  ensureRevenueTotals(finance.revenue);
  return finance;
}

export function applySponsorPayout(finance, amount) {
  if (!finance) return null;
  const normalized = ensureBudget(finance);
  const payout = Math.round(toNumber(amount, 0));
  if (!normalized || payout === 0) return null;
  normalized.budget.reserves += payout;
  normalized.revenue.sponsors = toNumber(normalized.revenue.sponsors, 0) + payout;
  ensureRevenueTotals(normalized.revenue);
  return {
    reserves: normalized.budget.reserves,
    sponsorsRevenue: normalized.revenue.sponsors
  };
}

export function ensureSponsorDeals(state, tid, options = {}) {
  if (!state || typeof state !== 'object') return { deals: [] };
  if (!state.teamSponsors || typeof state.teamSponsors !== 'object') {
    state.teamSponsors = {};
  }
  if (!state.teamSponsors[tid]) {
    const deals = Array.isArray(options.deals) ? options.deals : [];
    state.teamSponsors[tid] = { deals: normalizeDeals(deals) };
    return state.teamSponsors[tid];
  }
  const teamState = state.teamSponsors[tid];
  const existingDeals = Array.isArray(teamState.deals) ? teamState.deals : [];
  teamState.deals = normalizeDeals(existingDeals);
  return teamState;
}

function toStageList(stageConfig) {
  if (Array.isArray(stageConfig)) return stageConfig.filter(Boolean);
  if (stageConfig == null) return [];
  return [stageConfig];
}

function evaluateTriggers(deal, metrics, context) {
  const progress = deal.progress || (deal.progress = createProgress());
  const awards = [];
  progress.metrics = progress.metrics || {};
  progress.metrics.wins = metrics.wins;
  progress.lastEvaluatedDay = context.day ?? null;

  if (deal.base.amount > 0 && !progress.baseAwarded) {
    awards.push({
      type: 'base',
      triggerId: 'base',
      amount: deal.base.amount,
      description: deal.base.summary || `${deal.name} 基本保証`,
      detail: deal.base.summary || ''
    });
    progress.baseAwarded = true;
  }

  deal.bonusTriggers.forEach((trigger) => {
    const triggerId = trigger.id;
    if (!triggerId || (trigger.once && progress.triggered[triggerId])) {
      if (!trigger.once) {
        progress.triggered[triggerId] = progress.triggered[triggerId] || false;
      }
      return;
    }
    const payout = Math.round(toNumber(trigger.payout, 0));
    if (payout <= 0) {
      return;
    }

    let satisfied = false;
    let detail = trigger.description || '';

    switch (trigger.type) {
      case TRIGGER_TYPES.WINS: {
        const threshold = toNumber(trigger.threshold, 0);
        const wins = metrics.wins;
        progress.metrics.wins = wins;
        if (wins >= threshold) {
          satisfied = true;
          if (!detail) {
            detail = `${wins}勝達成`;
          }
        }
        break;
      }
      case TRIGGER_TYPES.STAGE: {
        const stages = toStageList(trigger.stage || trigger.threshold);
        if (stages.length) {
          if (stages.includes(context.stage) && context.stage && context.previousStage !== context.stage) {
            satisfied = true;
            progress.metrics.stageReached = context.stage;
            if (!detail) {
              detail = `${context.stage} 進出`;
            }
          }
        }
        break;
      }
      case TRIGGER_TYPES.STAT: {
        const statKey = trigger.stat || trigger.threshold?.stat || trigger.id;
        const threshold = toNumber(trigger.threshold, 0);
        const value = toNumber(metrics.stats?.[statKey], 0);
        progress.metrics[statKey] = value;
        if (value >= threshold) {
          satisfied = true;
          if (!detail) {
            detail = `${statKey}: ${value}`;
          }
        }
        break;
      }
      case TRIGGER_TYPES.CUSTOM: {
        if (typeof trigger.check === 'function') {
          satisfied = !!trigger.check({ deal, metrics, context, progress });
        }
        break;
      }
      default: {
        const statKey = trigger.stat || trigger.type;
        const threshold = toNumber(trigger.threshold, 0);
        const value = toNumber(metrics.stats?.[statKey] ?? metrics[statKey], 0);
        progress.metrics[statKey] = value;
        if (value >= threshold) {
          satisfied = true;
          if (!detail) {
            detail = `${statKey}: ${value}`;
          }
        }
        break;
      }
    }

    if (satisfied) {
      progress.triggered[triggerId] = true;
      awards.push({
        type: 'bonus',
        triggerId,
        trigger,
        amount: payout,
        description: trigger.description || detail,
        detail
      });
    }
  });

  return awards;
}

export function evaluateSponsorMilestonesForDay(state, context = {}, deps = {}) {
  if (!state || typeof state !== 'object') {
    return { payouts: [], totalPayout: 0 };
  }
  const results = Array.isArray(context.results) ? context.results : state.results || [];
  const statsByTeam = context.stats || {};
  const day = context.day ?? state.curr_day ?? 1;
  const stage = context.stage ?? state.seasonInfo?.stage ?? null;
  const previousStage = context.previousStage ?? state.seasonInfo?.previousStage ?? null;
  const ensureSponsors = typeof deps.ensureTeamSponsors === 'function'
    ? deps.ensureTeamSponsors
    : (s, tid) => ensureSponsorDeals(s, tid);
  const ensureFinances = typeof deps.ensureTeamFinances === 'function'
    ? deps.ensureTeamFinances
    : null;
  const payouts = [];
  let totalPayout = 0;

  const recordFinanceEntry = (entry) => {
    if (!Array.isArray(state.financeLog)) state.financeLog = [];
    state.financeLog.push(entry);
    if (typeof deps.logFinanceEvent === 'function') {
      deps.logFinanceEvent(entry);
    }
  };

  (state.teams || []).forEach(team => {
    if (!team) return;
    const tid = team.team_id;
    if (tid == null) return;
    const sponsorState = ensureSponsors(state, tid) || { deals: [] };
    if (!sponsorState.deals || sponsorState.deals.length === 0) return;

    if (!state.teamFinances || !state.teamFinances[tid]) {
      if (ensureFinances) {
        ensureFinances();
      }
    }
    const finance = state.teamFinances?.[tid];
    if (!finance) return;

    sponsorState.deals = normalizeDeals(sponsorState.deals);

    const metrics = {
      wins: countTeamWins(results, tid),
      stats: statsByTeam[tid] || {}
    };
    sponsorState.deals.forEach(deal => {
      const awards = evaluateTriggers(deal, metrics, { day, stage, previousStage });
      awards.forEach(award => {
        const payout = Math.round(toNumber(award.amount, 0));
        if (payout === 0) return;
        applySponsorPayout(finance, payout);
        totalPayout += payout;
        const financeEntry = {
          day,
          stage,
          teamId: tid,
          teamName: team.name || team.team || `Team ${tid}`,
          dealId: deal.id,
          triggerId: award.triggerId,
          amount: payout,
          type: 'sponsor',
          description: award.description || `${deal.name} ボーナス`,
          detail: award.detail || award.description || '',
        };
        recordFinanceEntry(financeEntry);
        payouts.push(financeEntry);
        if (typeof deps.recordNarrative === 'function') {
          deps.recordNarrative({
            teamId: tid,
            title: `${deal.name} ボーナス達成`,
            summary: `${team.name || `チーム${tid}`}が${formatCurrency(payout)}を獲得`,
            detail: award.detail || award.description || '',
            icon: 'yen',
            tag: 'SPONSOR',
            metadata: {
              dealId: deal.id,
              triggerId: award.triggerId,
              amount: payout,
              type: award.type
            }
          });
        }
        if (typeof deps.logHighlight === 'function') {
          const highlightText = `${team.name || `チーム${tid}`}: ${deal.name} ${formatCurrency(payout)}`;
          deps.logHighlight('yen', highlightText, {
            category: 'finance',
            day,
            stage,
            tid,
            triggerId: award.triggerId,
            type: 'sponsor'
          });
        }
      });
    });
  });

  return { payouts, totalPayout };
}

export { TRIGGER_TYPES };

export default {
  ensureSponsorDeals,
  evaluateSponsorMilestonesForDay,
  applySponsorPayout,
  TRIGGER_TYPES
};
