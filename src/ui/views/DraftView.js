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
    return `${pos} / 潜在${pot}`;
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
        ? '1巡目抽選'
        : payload?.round === 1
          ? '抽選指名'
          : `${payload?.round}巡目指名`;
      const teamName = payload?.teamId != null ? id2name(payload.teamId) : '—';
      const prospectName = payload?.prospect?.name || '不明な候補';
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
        body.append(createElement('span', { class: 'draft-log-meta' }, `敗者: ${losers}`));
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
      if (!pending.length) return shouldResolveFirstRound() ? '抽選処理中' : '入札待ちなし';
      return id2name(pending[0]);
    }
    const onClock = getOnClockTeam();
    return onClock != null ? id2name(onClock) : '—';
  }

  function formatStage(draft) {
    if (!draft?.active) return '準備中';
    if (draft.round === 1) {
      const bids = draft.bids?.length || 0;
      return `1巡目入札 ${bids}件`;
    }
    return `${draft.round}巡目 (${draft.direction === 1 ? '順' : '逆順'})`;
  }

  function updateSummary(state, draft, { teamId, userTeamId }) {
    if (!refs) return;
    if (!draft?.active) {
      refs.summaryRound.textContent = '—';
      refs.summaryStage.textContent = 'ドラフト未開始';
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
      refs.summaryPending.append(createElement('span', { class: 'draft-pending-pill' }, shouldResolveFirstRound() ? '抽選可能' : '待機中'));
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
    refs.autoToMeBtn.title = !active ? 'ドラフトを開始してください' : '自チームの番までシミュレート';
    refs.autoAllBtn.title = !active ? 'ドラフトを開始してください' : 'ドラフト完了までシミュレート';
    refs.resolveBtn.title = refs.resolveBtn.disabled ? '全チームの入札が揃うと抽選可能です' : '1巡目抽選を実行';
    refs.qaBtn.title = refs.qaBtn.disabled ? '1巡目入札待ちの状態で利用できます' : '人気候補にAI全チームが入札するQAシナリオ';
  }

  function buildScoutSummary(state, teamId) {
    const teamMeta = state.teamMeta?.[teamId] || {};
    const scoutingMeta = teamMeta.scouting || {};
    const assignments = scoutingMeta.assignments || {};
    const activeCount = Object.values(assignments).filter(a => a && a.active !== false && !a.completed).length;
    const limit = assignmentLimit(teamMeta);
    const summary = createElement('div', { class: 'scout-summary' });
    summary.append(
      createElement('span', { class: 'scout-pill' }, `調査Pt ${(scoutingMeta.points || 0).toFixed(1)}/${scoutingMeta.maxPoints || 24}`),
      createElement('span', { class: 'scout-pill' }, `派遣 ${activeCount}/${limit}`),
      createElement('span', { class: 'scout-pill' }, `主任Lv${scoutingMeta.staff?.lead || 0}`),
      createElement('span', { class: 'scout-pill' }, `野手Lv${scoutingMeta.staff?.bat || 0}`),
      createElement('span', { class: 'scout-pill' }, `投手Lv${scoutingMeta.staff?.pit || 0}`),
    );
    return { summary, scoutingMeta };
  }

  function buildProspectTable(state, draft, context) {
    const { teamId, userTeamId, isCommissioner } = context;
    const { summary, scoutingMeta } = buildScoutSummary(state, teamId);
    if (!draft?.active) {
      return createElement('div', { class: 'draft-table-card' },
        summary,
        createElement('div', { class: 'draft-empty-note' }, 'ドラフトクラスを生成すると候補者リストが表示されます。')
      );
    }
    const note = createElement('div', {
      class: 'mini',
      style: 'margin-bottom:8px;color:var(--text-secondary);'
    }, `※派遣開始には調査Pt${SCOUT_ASSIGN_COST}消費。進捗が進むと誤差が小さくなり伏字が解除されます。`);

    const table = createElement('table', {},
      createElement('thead', {},
        createElement('tr', {},
          ...['種別', '選手', '年', '役/守', '投', 'ミ/速', '選/コ', 'パ/変', '走/体', '守/—', 'ポ', '伸', '調査状況', '操作']
            .map(h => createElement('th', {}, h))
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
        const label = isFirstRound ? '入札' : '指名';
        const btn = createElement('button', { class: 'ghost' }, label);
        if (isFirstRound) {
          if (!nextFirst) {
            btn.disabled = true;
            btn.title = '現在は抽選処理中です';
            return btn;
          }
          if (!isCommissioner && nextFirst !== userTeamId) {
            btn.disabled = true;
            btn.title = '自チームの順番ではありません（コミッショナーモードで可）';
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
          btn.title = '指名順が設定されていません';
          return btn;
        }
        if (!isCommissioner && onClockTeam !== userTeamId) {
          btn.disabled = true;
          btn.title = '自チームの順番ではありません（コミッショナーモードで可）';
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
          createElement('td', {}, '野手'),
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
          createElement('td', {}, '投手'),
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
      }, 'レポート');
      reportBtn.onclick = () => showReport(prospect, teamId);
      progressCell.append(progressDisplay(prospect, teamId), reportBtn);

      const actionCell = createElement('td', {});
      const group = createElement('div', { class: 'scout-button-group' });
      const assigned = scoutingMeta.assignments?.[prospect.pid];
      const dispatchBtn = createElement('button', {
        class: assigned && !assigned.completed ? 'primary' : 'ghost'
      }, assigned ? (assigned.completed ? '完了' : '中止') : '派遣');
      if (assigned && assigned.completed) {
        dispatchBtn.disabled = true;
        dispatchBtn.title = 'この候補の調査は完了しています。';
      }
      if (!allowScout) {
        dispatchBtn.disabled = true;
        dispatchBtn.title = '自チームのみ派遣可能（コミッショナーモードで全チーム）';
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
      createElement('h3', {}, 'ドラフト進行'),
      createElement('span', { class: 'draft-stage-badge' }, draft?.active ? formatStage(draft) : '準備中')
    );
    const summaryBody = createElement('div', { class: 'draft-card-body draft-summary-body' });
    const summaryGrid = createElement('div', { class: 'draft-summary-grid' });
    const roundValue = createElement('span', { class: 'draft-summary-value' }, '—');
    const stageValue = createElement('span', { class: 'draft-summary-value' }, '—');
    const clockValue = createElement('span', { class: 'draft-summary-value' }, '—');
    const pendingWrap = createElement('div', { class: 'draft-pending-list' });
    summaryGrid.append(
      createElement('div', { class: 'draft-summary-item' },
        createElement('span', { class: 'draft-summary-label' }, 'ラウンド'),
        roundValue
      ),
      createElement('div', { class: 'draft-summary-item' },
        createElement('span', { class: 'draft-summary-label' }, '進行状況'),
        stageValue
      ),
      createElement('div', { class: 'draft-summary-item' },
        createElement('span', { class: 'draft-summary-label' }, 'On the Clock'),
        clockValue
      )
    );
    const pendingCard = createElement('div', { class: 'draft-summary-item draft-pending-card' },
      createElement('span', { class: 'draft-summary-label' }, draft?.round === 1 ? '入札待ち' : '次のチーム'),
      pendingWrap
    );
    summaryGrid.append(pendingCard);
    summaryBody.append(summaryGrid);
    summaryCard.append(summaryHeader, summaryBody);

    const controlsCard = createElement('section', { class: 'draft-card' });
    const controlsHeader = createElement('div', { class: 'draft-card-header' },
      createElement('h3', {}, 'ドラフト操作'),
      createElement('span', { class: 'mini' }, 'オートシミュレーションとQAツール')
    );
    const controlsBody = createElement('div', { class: 'draft-card-body draft-controls-body' });
    const generateBtn = createElement('button', { class: 'primary' }, 'ドラフトクラス生成');
    generateBtn.onclick = () => {
      generateDraftClass?.();
    };
    const autoToMeBtn = createElement('button', {}, '自チームの番まで');
    autoToMeBtn.onclick = () => {
      const stateNow = getState();
      const draftNow = ensureDraft(stateNow);
      if (!draftNow?.active) return;
      autoUntilUser(context.userTeamId);
      saveAndRerender();
    };
    const autoAllBtn = createElement('button', {}, 'ドラフト完了まで');
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
    const resolveBtn = createElement('button', {}, '1巡目抽選');
    resolveBtn.onclick = () => {
      processFirstRoundResolution();
      checkDraftCompletion();
      saveAndRerender();
    };
    const qaBtn = createElement('button', { class: 'ghost' }, 'QA: AI全入札');
    qaBtn.onclick = () => runQaScenario(context);
    controlsBody.append(generateBtn, autoToMeBtn, autoAllBtn, resolveBtn, qaBtn,
      createElement('div', { class: 'draft-qa-note' }, 'QAボタンは人気候補に全AIチームが入札するシナリオを一括で再現します。抽選ボタンで結果を確認できます。'));
    controlsCard.append(controlsHeader, controlsBody);

    const tableCard = buildProspectTable(state, draft, context);

    const logCard = createElement('section', { class: 'draft-card' });
    const logHeader = createElement('div', { class: 'draft-card-header' },
      createElement('h3', {}, '抽選・指名ログ'),
      createElement('div', { class: 'draft-log-filters' },
        ...['all', 'lottery', 'snake'].map(key => {
          const labelMap = { all: 'すべて', lottery: '1巡目抽選', snake: '蛇行ドラフト' };
          const btn = createElement('button', { class: `ghost${key === currentFilter ? ' active' : ''}` }, labelMap[key]);
          btn.onclick = () => setFilter(key);
          refs?.filterButtons?.set?.(key, btn);
          return btn;
        })
      )
    );
    const logBody = createElement('div', { class: 'draft-card-body draft-log-body' });
    const logList = createElement('ul', { class: 'draft-log' });
    const logEmpty = createElement('div', { class: 'draft-log-empty' }, 'まだ抽選結果はありません。抽選や指名を実行するとここに履歴が表示されます。');
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
