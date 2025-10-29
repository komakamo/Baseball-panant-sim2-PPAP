export function createContractsView({
  createElement = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else node.setAttribute(key, value);
    });
    children.forEach(child => node.append(child));
    return node;
  },
  evaluateOffer,
  valuePlayerContract,
  normalizeContractTerms,
  ensurePlayerPersona,
  ensurePlayerContract,
  normalizeContract,
  upsertFinanceContract,
  updateFinancialSnapshots,
  logHighlight,
  getOverall = () => 50,
  onStateChange = () => {},
  recomputeAllRatingsAll,
  processFreeAgentSigning = null,
  millionFormatter = (value) => `¥${(value / 1000000).toFixed(1)}M`,
  refreshIcons = () => {},
} = {}) {
  if (typeof evaluateOffer !== 'function') {
    throw new Error('ContractsView requires an evaluateOffer function.');
  }
  if (typeof valuePlayerContract !== 'function') {
    throw new Error('ContractsView requires a valuePlayerContract function.');
  }
  if (typeof normalizeContractTerms !== 'function') {
    throw new Error('ContractsView requires normalizeContractTerms.');
  }
  if (typeof ensurePlayerContract !== 'function' || typeof normalizeContract !== 'function') {
    throw new Error('ContractsView requires contract normalization helpers.');
  }
  if (typeof upsertFinanceContract !== 'function' || typeof updateFinancialSnapshots !== 'function') {
    throw new Error('ContractsView requires finance update helpers.');
  }
  if (typeof logHighlight !== 'function') {
    throw new Error('ContractsView requires a logHighlight helper.');
  }

  const negotiationState = new Map();
  let lastContext = null;

  function clearObsoleteNegotiations(roster = null, teamId) {
    if (!roster) {
      negotiationState.clear();
      return;
    }
    const players = [...(roster.bats || []), ...(roster.pits || [])];
    const validIds = new Set(players.map(p => p.id));
    [...negotiationState.keys()].forEach(pid => {
      if (!validIds.has(pid)) negotiationState.delete(pid);
    });
    if (lastContext && lastContext.teamId !== teamId) {
      negotiationState.clear();
    }
  }

  function formatStatus(status) {
    if (!status) return '—';
    const map = {
      active: '稼働',
      negotiating: '交渉中',
      holdout: '保留',
      'free-agent': 'FA',
      expired: '満了',
    };
    return map[status] || status;
  }

  function probabilityText(probabilities = {}) {
    const format = (value) => `${Math.round((value || 0) * 100)}%`;
    return `受諾 ${format(probabilities.accept)} / 再交渉 ${format(probabilities.retry)} / 決裂 ${format(probabilities.breakOff)}`;
  }

  function normalizeOfferTerms(player, terms, market, context) {
    const normalized = normalizeContractTerms({
      years: terms.years,
      AAV: terms.AAV,
      incentives: terms.incentives,
      noTradeClause: terms.noTradeClause,
    }, { defaults: market });
    return {
      ...normalized,
      incentives: normalized.incentives,
      years: normalized.years,
      AAV: normalized.AAV,
      noTradeClause: normalized.noTradeClause,
      expectedAnnual: normalized.expectedAnnual,
      startSeason: context.season,
      expirySeason: context.season + (normalized.years || 1) - 1,
    };
  }

  function applyHold(player, context) {
    ensurePlayerContract(player, context.teamId, context.season);
    const contract = { ...player.contract };
    contract.status = 'negotiating';
    contract.daysRemaining = Math.max(5, (contract.daysRemaining || 20) - 2);
    player.contract = contract;
    upsertFinanceContract(context.teamId, player, contract);
    updateFinancialSnapshots(context.teamId);
    logHighlight('notebook-pen', `【交渉継続】${player.name}との交渉は継続中。再提示の余地があります。`, {
      category: 'finance',
      financeType: 'contract',
      tid: context.teamId,
      day: context.day,
    });
    negotiationState.delete(player.id);
    onStateChange();
  }

  function applyBreakOff(player, context) {
    ensurePlayerContract(player, context.teamId, context.season);
    const contract = { ...player.contract };
    contract.status = 'holdout';
    contract.daysRemaining = Math.max(7, (contract.daysRemaining || 18) + 4);
    player.contract = contract;
    upsertFinanceContract(context.teamId, player, contract);
    updateFinancialSnapshots(context.teamId);
    logHighlight('user-x', `【交渉決裂】${player.name}が交渉から離脱しました。条件の見直しが必要です。`, {
      category: 'finance',
      financeType: 'contract',
      tid: context.teamId,
      day: context.day,
    });
    negotiationState.delete(player.id);
    onStateChange();
  }

  function applyAcceptance(player, context, offerTerms, market) {
    ensurePlayerContract(player, context.teamId, context.season);
    const normalized = normalizeOfferTerms(player, offerTerms, market, context);
    let contract = normalizeContract({
      ...player.contract,
      AAV: normalized.AAV,
      salary: normalized.AAV,
      incentives: normalized.incentives,
      noTradeClause: normalized.noTradeClause,
      totalYears: normalized.years,
      years: normalized.years,
      yearsRemaining: normalized.years,
      startSeason: context.season,
      expirySeason: normalized.expirySeason,
      status: 'active',
      type: 'extension',
      expectedAnnual: normalized.expectedAnnual,
    }, player, context.teamId, context.season);
    if (contract.yearsRemaining <= 1) {
      contract.daysRemaining = 90;
    } else {
      contract.daysRemaining = null;
    }
    player.contract = { ...contract };
    upsertFinanceContract(context.teamId, player, contract);
    updateFinancialSnapshots(context.teamId);
    if (typeof recomputeAllRatingsAll === 'function') {
      recomputeAllRatingsAll();
    }
    if (context?.freeAgentSigning && typeof processFreeAgentSigning === 'function') {
      processFreeAgentSigning(context.state || {}, context.teamId, player.id, {
        player,
        protectedList: context.protectedList || [],
        getOverall,
        removePlayerFromRoster: context.removePlayerFromRoster,
        addPlayerToRoster: context.addPlayerToRoster,
        ensurePlayerContract,
        purgeFinanceContract: context.purgeFinanceContract,
        upsertFinanceContract,
        updateFinancialSnapshots,
        logHighlight,
        recomputeAllRatings: recomputeAllRatingsAll,
      });
    }
    const incentiveText = contract.incentives?.total ? ` (インセンティブ計${millionFormatter(contract.incentives.total)})` : '';
    logHighlight('wallet', `【契約合意】${player.name}と${contract.totalYears}年 AAV ${millionFormatter(contract.AAV)}${incentiveText}で合意しました。`, {
      category: 'finance',
      financeType: 'contract',
      tid: context.teamId,
      day: context.day,
    });
    negotiationState.delete(player.id);
    onStateChange();
  }

  function handleOffer(player, offerInput, context) {
    const { finance } = context;
    if (!finance) return;
    ensurePlayerPersona?.(player);
    const overall = typeof getOverall === 'function' ? getOverall(player) : player?.overall || 50;
    const market = valuePlayerContract(player, { overall });
    const offer = {
      AAV: offerInput.AAV,
      years: offerInput.years,
      incentives: offerInput.incentives ?? market.incentives,
      noTradeClause: offerInput.noTradeClause ?? player.contract?.noTradeClause ?? false,
    };
    const tolerance = player.contract?.status === 'holdout' ? 0.88 : 0.92;
    const evaluation = evaluateOffer(player, offer, {
      market,
      overall,
      persona: player.persona,
      teamPosture: finance.negotiationPosture,
      isExtension: true,
      tolerance,
      yearTolerance: 0.8,
      random: Math.random,
    });
    const negotiationEntry = {
      playerId: player.id,
      offer,
      evaluation,
      market,
      overall,
    };
    if (evaluation.breakOff) {
      negotiationState.delete(player.id);
      applyBreakOff(player, context);
      return;
    }
    negotiationState.set(player.id, negotiationEntry);
    render(lastContext);
  }

  function buildResultCell(player, context) {
    const entry = negotiationState.get(player.id);
    const cell = createElement('td', { class: 'result-cell' });
    if (!entry) {
      return cell;
    }
    const { evaluation, market } = entry;
    const textLines = [];
    if (evaluation.accepted) {
      textLines.push(`提示が受諾されました。 ${evaluation.terms.years}年 / ${millionFormatter(evaluation.terms.AAV)}`);
    } else {
      textLines.push('提示は拒否されました。カウンター条件をご確認ください。');
    }
    textLines.push(probabilityText(evaluation.probabilities));
    cell.append(createElement('div', { class: 'negotiation-text mini', html: textLines.join('<br>') }));
    const actionRow = createElement('div', { class: 'negotiation-actions' });
    if (evaluation.accepted) {
      const confirmBtn = createElement('button', { class: 'primary' }, '契約締結');
      confirmBtn.onclick = () => {
        applyAcceptance(player, context, evaluation.terms, market);
      };
      actionRow.append(confirmBtn);
      const adjustBtn = createElement('button', { class: 'ghost' }, '再提示');
      adjustBtn.onclick = () => {
        negotiationState.delete(player.id);
        render(lastContext);
      };
      actionRow.append(adjustBtn);
    } else {
      const counter = evaluation.counter || market;
      const acceptCounterBtn = createElement('button', { class: 'primary' }, 'カウンターで合意');
      acceptCounterBtn.onclick = () => {
        applyAcceptance(player, context, counter, market);
      };
      const holdBtn = createElement('button', { class: 'ghost' }, '保留');
      holdBtn.onclick = () => applyHold(player, context);
      const breakBtn = createElement('button', { class: 'ghost danger' }, '交渉打ち切り');
      breakBtn.onclick = () => applyBreakOff(player, context);
      actionRow.append(acceptCounterBtn, holdBtn, breakBtn);
    }
    cell.append(actionRow);
    return cell;
  }

  function createPlayerRow(player, context) {
    const overall = typeof getOverall === 'function' ? getOverall(player) : player?.overall || 50;
    const market = valuePlayerContract(player, { overall });
    const contract = player.contract || null;
    const defaultAAV = negotiationState.get(player.id)?.offer?.AAV || contract?.AAV || market.AAV;
    const defaultYears = negotiationState.get(player.id)?.offer?.years || contract?.yearsRemaining || contract?.years || market.years;
    const row = createElement('tr');
    const label = player.velo != null ? (player.role || player.sub_role || '投手') : (player.pos || '野手');
    row.append(
      createElement('td', {}, player.name),
      createElement('td', {}, label),
      createElement('td', {}, `${Math.round(overall)}`),
      createElement('td', {}, contract
        ? `${contract.yearsRemaining ?? contract.years ?? 0}年 / ${millionFormatter(contract.AAV || 0)}`
        : `${market.years}年 / ${millionFormatter(market.AAV)}`),
      createElement('td', {}, formatStatus(contract?.status))
    );
    const offerInput = createElement('input', {
      type: 'number',
      min: '5000000',
      step: '1000000',
      value: Math.round(defaultAAV || market.AAV),
    });
    offerInput.disabled = !context.canControl;
    const yearInput = createElement('input', {
      type: 'number',
      min: '1',
      max: '6',
      value: Math.max(1, Math.round(defaultYears || market.years || 1)),
    });
    yearInput.disabled = !context.canControl;
    const inputsCell = createElement('td', { class: 'offer-cell' },
      createElement('label', { class: 'mini' }, 'AAV'),
      offerInput,
      createElement('label', { class: 'mini' }, '年数'),
      yearInput
    );
    row.append(inputsCell);
    const actionCell = createElement('td');
    if (context.canControl) {
      const offerBtn = createElement('button', { class: 'primary' }, '提示');
      offerBtn.onclick = () => {
        const offer = {
          AAV: parseInt(offerInput.value, 10) || defaultAAV,
          years: parseInt(yearInput.value, 10) || defaultYears,
          incentives: market.incentives,
        };
        handleOffer(player, offer, context);
      };
      actionCell.append(offerBtn);
    } else {
      actionCell.append(createElement('span', { class: 'mini' }, '操作不可'));
    }
    row.append(actionCell);
    row.append(buildResultCell(player, context));
    return row;
  }

  function render(context) {
    if (!context || !context.container) return;
    const { container, roster, teamId } = context;
    clearObsoleteNegotiations(roster, teamId);
    lastContext = context;
    container.innerHTML = '';
    const wrap = createElement('div', { class: 'contract-negotiation' });
    const players = roster ? [...(roster.bats || []), ...(roster.pits || [])] : [];
    if (!players.length) {
      wrap.append(createElement('div', { class: 'mini' }, 'ロスターに選手がいません。')); 
      container.append(wrap);
      return;
    }
    players.sort((a, b) => (getOverall(b) || 0) - (getOverall(a) || 0));
    const table = createElement('table', { class: 'contract-table negotiation-table' },
      createElement('thead', {}, createElement('tr', {},
        createElement('th', {}, '選手'),
        createElement('th', {}, '役割'),
        createElement('th', {}, '総合'),
        createElement('th', {}, '現行契約/目安'),
        createElement('th', {}, '状態'),
        createElement('th', {}, '提示条件'),
        createElement('th', {}, '操作'),
        createElement('th', {}, '交渉結果')
      )),
      createElement('tbody')
    );
    players.forEach(player => {
      table.lastChild.append(createPlayerRow(player, context));
    });
    wrap.append(createElement('div', { class: 'table-scroll', style: 'max-height:360px;' }, table));
    wrap.append(createElement('div', { class: 'mini', style: 'color: var(--text-secondary);' }, '※ 提示条件は百万円単位で調整してください。保留すると締切が短縮されます。'));
    container.append(wrap);
    refreshIcons();
  }

  return { render };
}

export default createContractsView;
