import { t } from '../../i18n/translator.js';

export function createFAView({
  createElement = (tag, attrs = {}, ...children) => {
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
  },
  ensureFreeAgencyState,
  determineFreeAgencyEligibility,
  rankFreeAgent,
  getOverall = () => 50,
  millionFormatter = value => `¥${(value / 1000000).toFixed(1)}M`,
  onStateChange = () => {},
  refreshIcons = () => {},
} = {}) {
  if (typeof ensureFreeAgencyState !== 'function') {
    throw new Error('FAView requires ensureFreeAgencyState.');
  }
  if (typeof determineFreeAgencyEligibility !== 'function') {
    throw new Error('FAView requires determineFreeAgencyEligibility.');
  }
  if (typeof rankFreeAgent !== 'function') {
    throw new Error('FAView requires rankFreeAgent.');
  }

  const PROTECT_LIMIT = 28;

  function toId(value) {
    return value != null ? String(value) : '';
  }

  function formatServiceStatus(metadata = {}) {
    const { serviceTime, threshold, eligible } = metadata;
    if (serviceTime == null) return eligible ? t('fa.status.eligible') : t('fa.status.ineligible');
    const formatted = t('contract.term.years').replace('{years}', Number(serviceTime).toFixed(1));
    if (eligible == null) return formatted;
    if (eligible) return `${formatted}${t('fa.status.hasRight')}`;
    const need = threshold != null ? Math.max(0, Number(threshold) - Number(serviceTime)) : null;
    return need != null
      ? `${formatted}${t('fa.status.yearsLeft').replace('{years}', need.toFixed(1))}`
      : formatted;
  }

  function createRankBadge(rank) {
    const value = (rank || 'C').toUpperCase();
    const colorMap = {
      A: 'var(--bad)',
      B: 'var(--warn)',
      C: 'var(--text-secondary)',
    };
    const bgMap = {
      A: 'rgba(239,68,68,0.12)',
      B: 'rgba(252,211,77,0.18)',
      C: 'rgba(148,163,184,0.2)',
    };
    return createElement('span', {
      class: 'pill',
      style: `font-size:11px;padding:2px 8px;border-radius:999px;background:${bgMap[value] || bgMap.C};color:${colorMap[value] || colorMap.C};border:none;`,
      text: t('fa.rank').replace('{rank}', value),
    });
  }

  function compensationOptionsText(rank) {
    return t(`fa.compensation.${rank.toUpperCase()}`) || t('fa.compensation.C');
  }

  function resolveMetadata(entry = {}, fallbackPlayer = null) {
    const meta = { ...entry };
    if (meta.serviceTime == null && fallbackPlayer) {
      const eligibility = determineFreeAgencyEligibility(fallbackPlayer);
      meta.serviceTime = eligibility.serviceTime;
      meta.threshold = eligibility.threshold;
      meta.eligible = eligibility.eligible;
    }
    if (!meta.rank && fallbackPlayer) {
      const rankInfo = rankFreeAgent(fallbackPlayer);
      meta.rank = rankInfo.rank;
      meta.war = rankInfo.war;
      meta.averageSalary = rankInfo.averageSalary;
    }
    return meta;
  }

  function createStatusBadge(isProtected) {
    const text = isProtected ? t('fa.status.protected') : t('fa.status.exposed');
    const bg = isProtected ? 'rgba(0,168,243,0.18)' : 'rgba(239,68,68,0.18)';
    const color = isProtected ? 'var(--primary)' : 'var(--bad)';
    return createElement('span', {
      class: 'pill',
      style: `font-size:11px;padding:2px 8px;border-radius:999px;background:${bg};color:${color};border:none;`,
      text,
    });
  }

  function createProtectedTable(players, context) {
    const { teamId, faState, canControl } = context;
    const protectedList = Array.isArray(faState?.protectedLists?.[teamId])
      ? faState.protectedLists[teamId].map(toId)
      : [];
    const protectedSet = new Set(protectedList);

    const table = createElement('table', { class: 'contract-table' },
      createElement('thead', {}, createElement('tr', {},
        createElement('th', {}, t('fa.table.header.player')),
        createElement('th', {}, t('fa.table.header.pos_role')),
        createElement('th', {}, t('fa.table.header.overall')),
        createElement('th', {}, t('fa.table.header.status')),
        createElement('th', {}, t('fa.table.header.actions')),
      )),
      createElement('tbody')
    );

    const limitNotice = createElement('div', {
      class: 'mini',
      style: `color:${protectedList.length >= PROTECT_LIMIT ? 'var(--bad)' : 'var(--text-secondary)'};margin-bottom:4px;`,
      text: t('fa.protected.limit.note')
        .replace('{count}', protectedList.length)
        .replace('{limit}', PROTECT_LIMIT)
        .replace('{remaining}', Math.max(0, PROTECT_LIMIT - protectedList.length))
    });

    players.forEach(player => {
      const id = toId(player.id);
      const isProtected = protectedSet.has(id);
      const row = createElement('tr');
      const checkbox = createElement('input', {
        type: 'checkbox',
        value: id,
        ...(isProtected ? { checked: true } : {}),
      });
      checkbox.disabled = !canControl;
      if (canControl) {
        checkbox.onchange = () => {
          const wantProtect = checkbox.checked;
          const current = Array.isArray(faState.protectedLists?.[teamId])
            ? faState.protectedLists[teamId].map(toId)
            : [];
          const set = new Set(current);
          if (wantProtect) {
            if (set.has(id)) return;
            if (set.size >= PROTECT_LIMIT) {
              checkbox.checked = false;
              if (limitNotice) {
                limitNotice.style.color = 'var(--bad)';
                limitNotice.textContent = t('fa.protected.limit.full').replace('{limit}', PROTECT_LIMIT);
              }
              return;
            }
            set.add(id);
          } else {
            set.delete(id);
          }
          if (!faState.protectedLists) faState.protectedLists = {};
          faState.protectedLists[teamId] = Array.from(set);
          onStateChange();
        };
      }

      row.append(
        createElement('td', { style: 'text-align:left;white-space:normal;' }, document.createTextNode(player.name || t('prospect.unknown'))),
        createElement('td', {}, player.pos || player.role || '-'),
        createElement('td', {}, Math.round(getOverall(player))),
        createElement('td', {}, createStatusBadge(isProtected)),
        createElement('td', {}, checkbox),
      );
      table.lastChild.append(row);
    });

    const exposed = players.filter(p => !protectedSet.has(toId(p.id)));
    const exposedList = createElement('div', {
      class: 'mini',
      style: 'color:var(--text-secondary);margin-top:6px;white-space:normal;line-height:1.5;',
      text: exposed.length
        ? t('fa.exposed.list.title').replace('{count}', exposed.length).replace('{players}', exposed.map(p => p.name).join(' / '))
        : t('fa.exposed.list.empty')
    });

    const wrapper = createElement('div', { style: 'display:flex;flex-direction:column;gap:8px;' },
      limitNotice,
      createElement('div', { class: 'table-scroll', style: 'max-height:260px;' }, table),
      exposedList,
    );
    return wrapper;
  }

  function createPreferenceControls(entries, context) {
    const { teamId, canControl, season } = context;
    if (!entries.length) {
      return createElement('div', { class: 'mini', style: 'color:var(--text-secondary);' }, t('fa.outgoing.empty'));
    }
    const list = createElement('div', { style: 'display:flex;flex-direction:column;gap:12px;' });
    entries.forEach(entry => {
      const wrapper = createElement('div', {
        style: 'border:1px solid var(--card-border);border-radius:10px;padding:12px;background:rgba(248,250,252,0.9);display:flex;flex-direction:column;gap:8px;'
      });
      const header = createElement('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;' },
        createElement('strong', {}, entry.playerName || t('prospect.unknown')),
        createRankBadge(entry.rank),
        createElement('span', { class: 'mini', style: 'color:var(--text-secondary);' }, formatServiceStatus(entry))
      );
      wrapper.append(header);

      const optionsText = createElement('div', {
        class: 'mini',
        style: 'color:var(--text-secondary);',
        text: t('fa.compensation.options.title').replace('{options}', compensationOptionsText(entry.rank))
      });
      wrapper.append(optionsText);

      const preferenceKey = entry.preferences?.[teamId]
        || entry.preferredCompensation
        || (entry.rank === 'C' ? 'cash' : 'player');

      const controls = createElement('div', { style: 'display:flex;gap:16px;align-items:center;flex-wrap:wrap;' });
      const radioPlayer = createElement('input', {
        type: 'radio',
        name: `fa-comp-${entry.playerId}`,
        value: 'player',
        ...(preferenceKey === 'player' ? { checked: true } : {}),
      });
      const radioCash = createElement('input', {
        type: 'radio',
        name: `fa-comp-${entry.playerId}`,
        value: 'cash',
        ...(preferenceKey === 'cash' ? { checked: true } : {}),
      });
      if (entry.rank === 'C') {
        radioPlayer.disabled = true;
      }
      if (!canControl) {
        radioPlayer.disabled = true;
        radioCash.disabled = true;
      }

      function updatePreference(value) {
        if (!context.faState || !entry.playerId) return;
        const faEntry = context.faState.players?.[entry.playerId];
        if (!faEntry) return;
        if (!faEntry.preferences || typeof faEntry.preferences !== 'object') {
          faEntry.preferences = {};
        }
        faEntry.preferences[teamId] = value;
        faEntry.preferredCompensation = value;
        if (season != null) faEntry.preferenceSeason = season;
        onStateChange();
      }

      if (canControl) {
        radioPlayer.onchange = () => { if (radioPlayer.checked) updatePreference('player'); };
        radioCash.onchange = () => { if (radioCash.checked) updatePreference('cash'); };
      }

      controls.append(
        createElement('label', { style: 'display:inline-flex;align-items:center;gap:6px;' }, radioPlayer, document.createTextNode(t('fa.compensation.player'))),
        createElement('label', { style: 'display:inline-flex;align-items:center;gap:6px;' }, radioCash, document.createTextNode(t('fa.compensation.cash')))
      );
      wrapper.append(controls);

      if (entry.compensation) {
        const detail = entry.compensation.type === 'player'
          ? t('fa.compensation.result.player').replace('{name}', entry.compensation.playerName || t('prospects.table.header.name'))
          : entry.compensation.type === 'cash'
            ? t('fa.compensation.result.cash').replace('{amount}', millionFormatter(entry.compensation.amount || 0))
            : entry.compensation.reason || entry.compensation.type;
        wrapper.append(createElement('div', { class: 'mini', style: 'color:var(--primary);' }, t('fa.compensation.result.title').replace('{detail}', detail)));
      }

      list.append(wrapper);
    });
    return list;
  }

  function createMarketTable(players, context) {
    if (!players.length) {
      return createElement('div', { class: 'mini', style: 'color:var(--text-secondary);' }, t('fa.market.empty'));
    }
    const table = createElement('table', { class: 'contract-table' },
      createElement('thead', {}, createElement('tr', {},
        createElement('th', {}, t('fa.table.header.player')),
        createElement('th', {}, t('fa.table.header.pos_role')),
        createElement('th', {}, t('fa.table.header.overall')),
        createElement('th', {}, t('fa.table.header.service')),
        createElement('th', {}, t('fa.table.header.rank')),
        createElement('th', {}, t('fa.table.header.compensation')),
      )),
      createElement('tbody')
    );

    players.forEach(({ player, metadata }) => {
      const row = createElement('tr');
      row.append(
        createElement('td', { style: 'text-align:left;white-space:normal;' }, document.createTextNode(player.name || t('prospect.unknown'))),
        createElement('td', {}, player.pos || player.role || '-'),
        createElement('td', {}, Math.round(getOverall(player))),
        createElement('td', {}, formatServiceStatus(metadata)),
        createElement('td', {}, createRankBadge(metadata.rank)),
        createElement('td', { style: 'white-space:normal;' }, compensationOptionsText(metadata.rank))
      );
      table.lastChild.append(row);
    });

    return createElement('div', { class: 'table-scroll', style: 'max-height:320px;' }, table);
  }

  function render(context = {}) {
    const { container } = context;
    if (!(container instanceof HTMLElement)) return;
    const state = context.state || {};
    const faState = context.faState && typeof context.faState === 'object'
      ? context.faState
      : ensureFreeAgencyState(state);

    const roster = context.roster || { bats: [], pits: [] };
    const players = [];
    if (Array.isArray(roster.bats)) {
      roster.bats.forEach(p => players.push(p));
    }
    if (Array.isArray(roster.pits)) {
      roster.pits.forEach(p => players.push(p));
    }
    players.sort((a, b) => getOverall(b) - getOverall(a));

    const marketPlayers = Array.isArray(context.freeAgents)
      ? context.freeAgents
      : Array.isArray(state.freeAgents)
        ? state.freeAgents
        : [];
    const marketEntries = marketPlayers.map(player => {
      const entry = faState.players?.[player.id] || {};
      const metadata = resolveMetadata(entry, player);
      return { player, metadata };
    }).sort((a, b) => {
      const rankOrder = { A: 0, B: 1, C: 2 };
      const rankDiff = (rankOrder[a.metadata.rank] ?? 2) - (rankOrder[b.metadata.rank] ?? 2);
      if (rankDiff !== 0) return rankDiff;
      return getOverall(b.player) - getOverall(a.player);
    });

    const outgoingEntries = Object.values(faState.players || {})
      .filter(entry => toId(entry.originTid ?? entry.lastTeamId) === toId(context.teamId))
      .map(entry => ({
        ...entry,
        rank: entry.rank || 'C',
      }))
      .sort((a, b) => {
        const rankOrder = { A: 0, B: 1, C: 2 };
        const diff = (rankOrder[a.rank] ?? 2) - (rankOrder[b.rank] ?? 2);
        if (diff !== 0) return diff;
        return (b.war ?? 0) - (a.war ?? 0);
      });

    container.innerHTML = '';
    const wrapper = createElement('div', { class: 'fa-view', style: 'display:flex;flex-direction:column;gap:16px;' });

    const protectCard = createElement('div', {
      class: 'finance-card',
      style: 'box-shadow:inset 0 2px 0 rgba(148,163,184,0.12);',
    });
    protectCard.append(
      createElement('h3', {}, createElement('i', { 'data-lucide': 'shield', class: 'mini-icon' }), t('fa.protect.title')),
      createProtectedTable(players, { ...context, faState })
    );
    wrapper.append(protectCard);

    const preferenceCard = createElement('div', {
      class: 'finance-card',
      style: 'box-shadow:inset 0 2px 0 rgba(148,163,184,0.12);',
    });
    preferenceCard.append(
      createElement('h3', {}, createElement('i', { 'data-lucide': 'scale', class: 'mini-icon' }), t('fa.policy.title')),
      createPreferenceControls(outgoingEntries, { ...context, faState })
    );
    wrapper.append(preferenceCard);

    const marketCard = createElement('div', {
      class: 'finance-card',
      style: 'box-shadow:inset 0 2px 0 rgba(148,163,184,0.12);',
    });
    marketCard.append(
      createElement('h3', {}, createElement('i', { 'data-lucide': 'store', class: 'mini-icon' }), t('fa.market.title')),
      createMarketTable(marketEntries, context)
    );
    wrapper.append(marketCard);

    container.append(wrapper);
    refreshIcons();
  }

  return { render };
}

export default createFAView;
