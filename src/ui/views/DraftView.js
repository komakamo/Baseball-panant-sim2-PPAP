import { t } from '../../i18n/translator.js';

export function createDraftView({
  createElement = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === 'class') node.className = value;
      else if (key === 'html') node.innerHTML = value;
      else if (value != null) node.setAttribute(key, value);
    });
    children.forEach(child => node.append(child));
    return node;
  },
  getState = () => ({}),
  ensureDraft,
  ensureTeamMeta,
  ensureTeamNeedsAll,
  ensureProspectStructure,
  id2name = id => `Team ${id}`,
  scouting = {},
  actions = {},
  qa = {},
  generateDraftClass,
  refreshIcons = () => {},
} = {}) {
  if (typeof ensureDraft !== 'function') throw new Error('DraftView requires ensureDraft.');
  if (typeof ensureTeamMeta !== 'function') throw new Error('DraftView requires ensureTeamMeta.');
  if (typeof ensureTeamNeedsAll !== 'function') throw new Error('DraftView requires ensureTeamNeedsAll.');
  if (typeof ensureProspectStructure !== 'function') throw new Error('DraftView requires ensureProspectStructure.');
  if (!actions || typeof actions.saveAndRerender !== 'function') throw new Error('DraftView requires actions.saveAndRerender.');

  const {
    SCOUT_ASSIGN_COST = 0,
    assignmentLimit = () => 0,
    progressDisplay = () => document.createTextNode(''),
    statCell = () => createElement('td', {}, '-') ,
    growthCurveSVG = () => document.createTextNode(''),
    showReport = () => {},
    toggleAssignment = () => {},
    evaluateScouted = () => 0,
  } = scouting || {};

  const {
    submitBid = () => {},
    selectProspect = () => null,
    shouldResolveFirstRound = () => false,
    processFirstRoundResolution = () => ({ winners: [], losers: [] }),
    checkDraftCompletion = () => false,
    getPendingTeams = () => [],
    getOnClockTeam = () => null,
    isDraftComplete = () => false,
    autoUntilUser = () => {},
    autoDraftStep = () => false,
    saveAndRerender,
    saveState = () => {},
  } = actions || {};

  const {
    evaluateProspectForTeam = () => 0,
    getNextDraftActor = () => null,
  } = qa || {};

  const logEntries = [];
  const logLimit = 80;
  let currentFilter = 'all';
  let refs = null;

  function pushLogEntry(type, payload) {
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      type,
      payload,
      round: payload?.round || 1,
      teamId: payload?.teamId ?? null,
      contested: Boolean(payload?.contested),
      timestamp: Date.now(),
    };
    if (entry.round === 1 && entry.type === 'selection' && payload?.contested) {
      entry.category = 'lottery';
    } else if (entry.type === 'lottery') {
      entry.category = 'lottery';
    } else {
      entry.category = 'snake';
    }
    logEntries.unshift(entry);
    if (logEntries.length > logLimit) logEntries.length = logLimit;
    renderLog();
  }

  function formatProspectTag(prospect) {
    if (!prospect) return '';
    const pos = prospect.pos || prospect.role || '-';
    const pot = prospect.trueRatings?.pot ?? prospect.pot ?? '-';
    return `${pos} / ${t('prospect.potential')}${pot}`;
  }

  function renderLog() {
    if (!refs || !refs.logList) return;
    const { logList, logEmpty } = refs;
    logList.innerHTML = '';
    const filtered = logEntries.filter(entry => {
      if (currentFilter === 'all') return true;
      return entry.category === currentFilter;
    });
    if (!filtered.length) {
      logEmpty.style.display = 'block';
      return;
    }
    logEmpty.style.display = 'none';
    filtered.slice(0, 30).forEach(entry => {
      const { type, payload, category, contested } = entry;
      const wrapper = createElement('li', { class: `draft-log-entry ${category}` });
      const title = type === 'lottery'
        ? t('draft.log.firstRoundLottery')
        : payload?.round === 1
          ? t('draft.log.lotterySelection')
          : t('draft.log.roundSelection').replace('{round}', payload?.round);
      const teamName = payload?.teamId != null ? id2name(payload.teamId) : '—';
      const prospectName = payload?.prospect?.name || t('prospect.unknown');
      const headline = createElement('div', { class: 'draft-log-headline' },
        createElement('span', { class: 'draft-log-title' }, title),
        createElement('span', { class: 'draft-log-team' }, teamName)
      );
      const body = createElement('div', { class: 'draft-log-body' });
      body.append(createElement('span', { class: 'draft-log-prospect' }, prospectName));
      const tag = formatProspectTag(payload?.prospect);
      if (tag) body.append(createElement('span', { class: 'draft-log-meta' }, tag));
      if (contested && payload?.losers?.length) {
        const losers = payload.losers.map(id2name).join('、');
        body.append(createElement('span', { class: 'draft-log-meta' }, t('draft.log.losers').replace('{losers}', losers)));
      }
      const footer = createElement('div', { class: 'draft-log-footer' },
        new Date(entry.timestamp).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })
      );
      wrapper.append(headline, body, footer);
      logList.append(wrapper);
    });
  }

  function setFilter(filter) {
    currentFilter = filter;
    if (!refs) return;
    refs.filterButtons.forEach((btn, key) => {
      if (key === filter) btn.classList.add('active');
      else btn.classList.remove('active');
    });
    renderLog();
  }

  function formatRound(draft) {
    if (!draft) return '—';
    return `R${draft.round}/${draft.rounds}`;
  }

  function formatOnClock(draft) {
    if (!draft) return '—';
    if (draft.round === 1) {
      const pending = getPendingTeams();
      if (!pending.length) return shouldResolveFirstRound() ? t('draft.status.resolvingLottery') : t('draft.status.noBids');
      return id2name(pending[0]);
    }
    const onClock = getOnClockTeam();
    return onClock != null ? id2name(onClock) : '—';
  }

  function formatStage(draft) {
    if (!draft?.active) return t('draft.status.preparing');
    if (draft.round === 1) {
      const bids = draft.bids?.length || 0;
      return t('draft.status.firstRoundBidding').replace('{bids}', bids);
    }
    const direction = draft.direction === 1 ? t('draft.direction.forward') : t('draft.direction.reverse');
    return t('draft.status.roundInProgress').replace('{round}', draft.round).replace('{direction}', direction);
  }

  function updateSummary(state, draft, { teamId, userTeamId }) {
    if (!refs) return;
    if (!draft?.active) {
      refs.summaryRound.textContent = '—';
      refs.summaryStage.textContent = t('draft.unstarted');
      refs.summaryClock.textContent = '—';
      refs.summaryPending.innerHTML = '';
      return;
    }
    refs.summaryRound.textContent = formatRound(draft);
    refs.summaryStage.textContent = formatStage(draft);
    refs.summaryClock.textContent = formatOnClock(draft);
    const pending = draft.round === 1 ? getPendingTeams() : [];
    refs.summaryPending.innerHTML = '';
    if (draft.round === 1 && pending.length) {
      pending.forEach(tid => {
        refs.summaryPending.append(createElement('span', {
          class: `draft-pending-pill${tid === userTeamId ? ' user' : ''}`
        }, id2name(tid)));
      });
    } else if (draft.round === 1) {
      refs.summaryPending.append(createElement('span', { class: 'draft-pending-pill' }, shouldResolveFirstRound() ? t('draft.status.lotteryReady') : t('draft.status.waiting')));
    } else {
      const next = getNextDraftActor();
      refs.summaryPending.append(createElement('span', { class: 'draft-pending-pill' }, next != null ? id2name(next) : '—'));
    }
  }

  function updateControls(state, draft, context) {
    if (!refs) return;
    const { isCommissioner, userTeamId } = context;
    const active = Boolean(draft?.active);
    refs.generateBtn.disabled = active;
    refs.autoToMeBtn.disabled = !active;
    refs.autoAllBtn.disabled = !active;
    refs.resolveBtn.disabled = !(active && shouldResolveFirstRound());
    if (!active || draft.round !== 1) {
      refs.qaBtn.disabled = true;
    } else {
      refs.qaBtn.disabled = draft.pendingFirstRound?.length === 0;
    }
    if (refs.manualClock) {
      refs.manualClock.textContent = formatOnClock(draft);
    }
    if (refs.stageBadge) {
      refs.stageBadge.textContent = formatStage(draft);
    }
    refs.autoToMeBtn.title = !active ? t('draft.tooltip.mustStart') : t('draft.tooltip.autoSimToUser');
    refs.autoAllBtn.title = !active ? t('draft.tooltip.mustStart') : t('draft.tooltip.autoSimToEnd');
    refs.resolveBtn.title = refs.resolveBtn.disabled ? t('draft.tooltip.resolveFirstRound.disabled') : t('draft.tooltip.resolveFirstRound.enabled');
    refs.qaBtn.title = refs.qaBtn.disabled ? t('draft.tooltip.qa.disabled') : t('draft.tooltip.qa.enabled');
  }

  function buildScoutSummary(state, teamId) {
    const teamMeta = state.teamMeta?.[teamId] || {};
    const scoutingMeta = teamMeta.scouting || {};
    const assignments = scoutingMeta.assignments || {};
    const activeCount = Object.values(assignments).filter(a => a && a.active !== false && !a.completed).length;
    const limit = assignmentLimit(teamMeta);
    const summary = createElement('div', { class: 'scout-summary' });
    summary.append(
      createElement('span', { class: 'scout-pill' }, `${t('scouting.points')} ${(scoutingMeta.points || 0).toFixed(1)}/${scoutingMeta.maxPoints || 24}`),
      createElement('span', { class: 'scout-pill' }, `${t('scouting.dispatch')} ${activeCount}/${limit}`),
      createElement('span', { class: 'scout-pill' }, t('scouting.staff.lead').replace('{level}', scoutingMeta.staff?.lead || 0)),
      createElement('span', { class: 'scout-pill' }, t('scouting.staff.bat').replace('{level}', scoutingMeta.staff?.bat || 0)),
      createElement('span', { class: 'scout-pill' }, t('scouting.staff.pit').replace('{level}', scoutingMeta.staff?.pit || 0)),
    );
    return { summary, scoutingMeta };
  }

  function buildProspectTable(state, draft, context) {
    const { teamId, userTeamId, isCommissioner } = context;
    const { summary, scoutingMeta } = buildScoutSummary(state, teamId);
    if (!draft?.active) {
      return createElement('div', { class: 'draft-table-card' },
        summary,
        createElement('div', { class: 'draft-empty-note' }, t('draft.prospects.table.empty'))
      );
    }
    const note = createElement('div', {
      class: 'mini',
      style: 'margin-bottom:8px;color:var(--text-secondary);'
    }, t('scouting.note').replace('{cost}', SCOUT_ASSIGN_COST));

    const table = createElement('table', {},
      createElement('thead', {},
        createElement('tr', {},
          ...[
            'prospects.table.header.type', 'prospects.table.header.name', 'prospects.table.header.age',
            'prospects.table.header.pos', 'prospects.table.header.hand', 'prospects.table.header.con_velo',
            'prospects.table.header.disc_ctrl', 'prospects.table.header.pwr_mov', 'prospects.table.header.spd_stam',
            'prospects.table.header.fld', 'prospects.table.header.pot', 'prospects.table.header.growth',
            'prospects.table.header.scoutStatus', 'prospects.table.header.actions'
          ].map(h => createElement('th', {}, t(h)))
        )
      ),
      createElement('tbody')
    );

    const rows = table.lastChild;
    const pool = Array.isArray(draft?.pool) ? draft.pool.slice() : [];
    const sorted = pool.map(p => {
      ensureProspectStructure(p);
      return p;
    }).sort((a, b) => evaluateScouted(b, teamId) - evaluateScouted(a, teamId));

    const pending = getPendingTeams();
    const nextFirst = pending.length > 0 ? pending[0] : null;
    const onClock = draft.round === 1 ? nextFirst : getOnClockTeam();

    sorted.forEach(prospect => {
      const tr = createElement('tr');
      const allowScout = isCommissioner || teamId === userTeamId;
      const canPickNow = !!onClock && (isCommissioner || onClock === userTeamId);

      const renderActionButton = () => {
        const isFirstRound = draft.round === 1;
        const label = isFirstRound ? t('action.bid') : t('action.pick');
        const btn = createElement('button', { class: 'ghost' }, label);
        if (isFirstRound) {
          if (!nextFirst) {
            btn.disabled = true;
            btn.title = t('tooltip.lotteryInProgress');
            return btn;
          }
          if (!isCommissioner && nextFirst !== userTeamId) {
            btn.disabled = true;
            btn.title = t('tooltip.notYourTurn');
            return btn;
          }
          btn.onclick = () => {
            const targetTid = isCommissioner ? nextFirst : userTeamId;
            submitBid(targetTid, prospect.pid);
            saveState();
            if (shouldResolveFirstRound()) {
              processFirstRoundResolution();
              checkDraftCompletion();
            }
            saveAndRerender();
          };
          return btn;
        }
        const onClockTeam = getOnClockTeam();
        if (onClockTeam == null) {
          btn.disabled = true;
          btn.title = t('tooltip.pickOrderNotSet');
          return btn;
        }
        if (!isCommissioner && onClockTeam !== userTeamId) {
          btn.disabled = true;
          btn.title = t('tooltip.notYourTurn');
          return btn;
        }
        btn.onclick = () => {
          const targetTid = isCommissioner ? onClockTeam : userTeamId;
          const result = selectProspect(targetTid, prospect.pid);
          if (result) {
            checkDraftCompletion();
          }
          saveAndRerender();
        };
        return btn;
      };

      const prospectRow = [];
      if (prospect.type === 'BAT') {
        prospectRow.push(
          createElement('td', {}, t('prospect.type.batter')),
          createElement('td', {}, prospect.name),
          createElement('td', {}, prospect.age),
          createElement('td', {}, prospect.pos),
          createElement('td', {}, prospect.hand || '—'),
          statCell(prospect, 'con', teamId),
          statCell(prospect, 'disc', teamId),
          statCell(prospect, 'pwr', teamId),
          statCell(prospect, 'spd', teamId),
          statCell(prospect, 'fld', teamId),
          statCell(prospect, 'pot', teamId),
          createElement('td', {}, growthCurveSVG(prospect.growthCurve)),
        );
      } else {
        prospectRow.push(
          createElement('td', {}, t('prospect.type.pitcher')),
          createElement('td', {}, prospect.name),
          createElement('td', {}, prospect.age),
          createElement('td', {}, prospect.role || prospect.pos || '—'),
          createElement('td', {}, prospect.hand || '—'),
          statCell(prospect, 'velo', teamId),
          statCell(prospect, 'ctrl', teamId),
          statCell(prospect, 'mov', teamId),
          statCell(prospect, 'stam', teamId),
          createElement('td', {}, '—'),
          statCell(prospect, 'pot', teamId),
          createElement('td', {}, growthCurveSVG(prospect.growthCurve)),
        );
      }

      const progressCell = createElement('td', {});
      const reportBtn = createElement('button', {
        class: 'ghost',
        style: 'margin-top:6px;font-size:12px;padding:6px 10px;display:inline-flex;align-items:center;gap:6px;'
      }, t('action.report'));
      reportBtn.onclick = () => showReport(prospect, teamId);
      progressCell.append(progressDisplay(prospect, teamId), reportBtn);

      const actionCell = createElement('td', {});
      const group = createElement('div', { class: 'scout-button-group' });
      const assigned = scoutingMeta.assignments?.[prospect.pid];
      const dispatchBtn = createElement('button', {
        class: assigned && !assigned.completed ? 'primary' : 'ghost'
      }, assigned ? (assigned.completed ? t('action.complete') : t('action.cancel')) : t('scouting.dispatch'));
      if (assigned && assigned.completed) {
        dispatchBtn.disabled = true;
        dispatchBtn.title = t('tooltip.scouting.complete');
      }
      if (!allowScout) {
        dispatchBtn.disabled = true;
        dispatchBtn.title = t('tooltip.scouting.notAllowed');
      }
      dispatchBtn.onclick = () => {
        if (!allowScout) return;
        toggleAssignment(teamId, prospect);
        saveAndRerender();
      };
      const actionBtn = renderActionButton();
      if (!canPickNow) actionBtn.disabled = true;
      group.append(dispatchBtn, actionBtn);
      actionCell.append(group);

      tr.append(...prospectRow, progressCell, actionCell);
      rows.append(tr);
    });

    const container = createElement('div', { class: 'draft-table-card' },
      summary,
      note,
      createElement('div', { class: 'table-scroll' }, table)
    );
    return container;
  }

  function runQaScenario(context) {
    const state = getState();
    const draft = ensureDraft(state);
    if (!draft?.active || draft.round !== 1) return;
    const pool = Array.isArray(draft.pool) ? draft.pool.slice() : [];
    if (!pool.length) return;
    const candidates = pool.map(p => {
      ensureProspectStructure(p);
      return p;
    }).sort((a, b) => evaluateProspectForTeam(b, null) - evaluateProspectForTeam(a, null));
    const target = candidates[0];
    if (!target) return;
    const userTeamId = context.userTeamId;
    const order = Array.isArray(draft.order) ? draft.order.slice() : [];
    order.forEach(teamId => {
      if (teamId === userTeamId) return;
      submitBid(teamId, target.pid);
    });
    saveState();
    if (shouldResolveFirstRound()) {
      processFirstRoundResolution();
      checkDraftCompletion();
    }
    saveAndRerender();
  }

  function buildView(state, context) {
    const draft = ensureDraft(state);
    const root = createElement('div', { class: 'draft-view' });

    const summaryCard = createElement('section', { class: 'draft-card' });
    const summaryHeader = createElement('div', { class: 'draft-card-header' },
      createElement('h3', {}, t('draft.summary.title')),
      createElement('span', { class: 'draft-stage-badge' }, draft?.active ? formatStage(draft) : t('draft.status.preparing'))
    );
    const summaryBody = createElement('div', { class: 'draft-card-body draft-summary-body' });
    const summaryGrid = createElement('div', { class: 'draft-summary-grid' });
    const roundValue = createElement('span', { class: 'draft-summary-value' }, '—');
    const stageValue = createElement('span', { class: 'draft-summary-value' }, '—');
    const clockValue = createElement('span', { class: 'draft-summary-value' }, '—');
    const pendingWrap = createElement('div', { class: 'draft-pending-list' });
    summaryGrid.append(
      createElement('div', { class: 'draft-summary-item' },
        createElement('span', { class: 'draft-summary-label' }, t('draft.round')),
        roundValue
      ),
      createElement('div', { class: 'draft-summary-item' },
        createElement('span', { class: 'draft-summary-label' }, t('draft.stage')),
        stageValue
      ),
      createElement('div', { class: 'draft-summary-item' },
        createElement('span', { class: 'draft-summary-label' }, t('draft.onTheClock')),
        clockValue
      )
    );
    const pendingCard = createElement('div', { class: 'draft-summary-item draft-pending-card' },
      createElement('span', { class: 'draft-summary-label' }, draft?.round === 1 ? t('draft.pendingBids') : t('draft.nextTeam')),
      pendingWrap
    );
    summaryGrid.append(pendingCard);
    summaryBody.append(summaryGrid);
    summaryCard.append(summaryHeader, summaryBody);

    const controlsCard = createElement('section', { class: 'draft-card' });
    const controlsHeader = createElement('div', { class: 'draft-card-header' },
      createElement('h3', {}, t('draft.controls.title')),
      createElement('span', { class: 'mini' }, t('draft.controls.subtitle'))
    );
    const controlsBody = createElement('div', { class: 'draft-card-body draft-controls-body' });
    const generateBtn = createElement('button', { class: 'primary' }, t('draft.generateClass'));
    generateBtn.onclick = () => {
      generateDraftClass?.();
    };
    const autoToMeBtn = createElement('button', {}, t('draft.autoSimToUser'));
    autoToMeBtn.onclick = () => {
      const stateNow = getState();
      const draftNow = ensureDraft(stateNow);
      if (!draftNow?.active) return;
      autoUntilUser(context.userTeamId);
      saveAndRerender();
    };
    const autoAllBtn = createElement('button', {}, t('draft.autoSimToEnd'));
    autoAllBtn.onclick = () => {
      const stateNow = getState();
      const draftNow = ensureDraft(stateNow);
      if (!draftNow?.active) return;
      let guard = 6000;
      while (ensureDraft(getState())?.active && !isDraftComplete() && guard-- > 0) {
        if (!autoDraftStep(null)) break;
      }
      checkDraftCompletion();
      saveAndRerender();
    };
    const resolveBtn = createElement('button', {}, t('draft.resolveFirstRound'));
    resolveBtn.onclick = () => {
      processFirstRoundResolution();
      checkDraftCompletion();
      saveAndRerender();
    };
    const qaBtn = createElement('button', { class: 'ghost' }, t('draft.qa.allBid'));
    qaBtn.onclick = () => runQaScenario(context);
    controlsBody.append(generateBtn, autoToMeBtn, autoAllBtn, resolveBtn, qaBtn,
      createElement('div', { class: 'draft-qa-note' }, t('draft.qa.note')));
    controlsCard.append(controlsHeader, controlsBody);

    const tableCard = buildProspectTable(state, draft, context);

    const logCard = createElement('section', { class: 'draft-card' });
    const logHeader = createElement('div', { class: 'draft-card-header' },
      createElement('h3', {}, t('draft.log.title')),
      createElement('div', { class: 'draft-log-filters' },
        ...['all', 'lottery', 'snake'].map(key => {
          const btn = createElement('button', { class: `ghost${key === currentFilter ? ' active' : ''}` }, t(`draft.log.filter.${key}`));
          btn.onclick = () => setFilter(key);
          refs?.filterButtons?.set?.(key, btn);
          return btn;
        })
      )
    );
    const logBody = createElement('div', { class: 'draft-card-body draft-log-body' });
    const logList = createElement('ul', { class: 'draft-log' });
    const logEmpty = createElement('div', { class: 'draft-log-empty' }, t('draft.log.empty'));
    logBody.append(logList, logEmpty);
    logCard.append(logHeader, logBody);

    const topGrid = createElement('div', { class: 'draft-grid' });
    topGrid.append(summaryCard, controlsCard, logCard);
    root.append(topGrid, tableCard);

    refs = {
      summaryRound: roundValue,
      summaryStage: stageValue,
      summaryClock: clockValue,
      summaryPending: pendingWrap,
      manualClock: clockValue,
      stageBadge: summaryHeader.querySelector('.draft-stage-badge'),
      generateBtn,
      autoToMeBtn,
      autoAllBtn,
      resolveBtn,
      qaBtn,
      logList,
      logEmpty,
      filterButtons: new Map(),
    };

    ['all', 'lottery', 'snake'].forEach((key, index) => {
      const button = logHeader.querySelectorAll('button')[index];
      refs.filterButtons.set(key, button);
    });

    return root;
  }

  function render({ container, teamId, userTeamId, isCommissioner }) {
    const state = getState();
    ensureTeamMeta();
    ensureTeamNeedsAll();
    const context = { teamId, userTeamId, isCommissioner };
    const host = buildView(state, context);
    container.append(host);
    const draft = ensureDraft(state);
    updateSummary(state, draft, context);
    updateControls(state, draft, context);
    setFilter(currentFilter);
    refreshIcons();
  }

  return {
    render,
    pushEvent: pushLogEntry,
  };
}

export default createDraftView;
