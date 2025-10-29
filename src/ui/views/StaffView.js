export function createStaffView({
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
  getState = () => ({}),
  ensureTeamFinances,
  ensureTeamMeta,
  updateFinancialSnapshots = () => {},
  id2name = id => `Team ${id}`,
  millionFormatter = value => `¥${(value / 1000000).toFixed(1)}M`,
  staffCosts = {},
  logHighlight = () => {},
  actions = {},
  refreshIcons = () => {},
} = {}) {
  if (typeof ensureTeamFinances !== 'function') {
    throw new Error('StaffView requires ensureTeamFinances.');
  }
  if (typeof ensureTeamMeta !== 'function') {
    throw new Error('StaffView requires ensureTeamMeta.');
  }
  if (!actions || typeof actions.saveAndRerender !== 'function') {
    throw new Error('StaffView requires actions.saveAndRerender.');
  }

  const {
    saveAndRerender,
    canControlTeam = () => false,
    showToast = null,
  } = actions;

  const STAFF_TYPES = [
    {
      key: 'coaches',
      icon: 'graduation-cap',
      label: 'コーチ陣',
      description: '打撃・投手を含む現場スタッフの層を厚くします。',
      max: 8,
    },
    {
      key: 'scouts',
      icon: 'binoculars',
      label: 'スカウト',
      description: 'アマチュア調査網を拡充し、ドラフト情報を強化します。',
      max: 8,
    },
    {
      key: 'analysts',
      icon: 'line-chart',
      label: 'アナリスト',
      description: 'データ分析体制を整え、選手評価や戦略立案を支援します。',
      max: 8,
    },
    {
      key: 'marketing',
      icon: 'megaphone',
      label: '営業・広報',
      description: '集客・ファンサービスを充実させ、人気向上を狙います。',
      max: 8,
    },
  ];

  function formatReserve(amount) {
    const value = Number(amount) || 0;
    if (Math.abs(value) < 1000000) {
      return `¥${value.toLocaleString()}`;
    }
    return millionFormatter(value);
  }

  function adjustStaffLevel(context, type, nextValue, controls) {
    const { teamId } = context;
    const state = getState();
    ensureTeamFinances();
    ensureTeamMeta();
    const finance = state.teamFinances?.[teamId];
    if (!finance) return false;
    if (!finance.staff) finance.staff = {};

    const currentValue = Number(finance.staff[type.key]) || 0;
    const next = Math.max(0, Math.min(type.max, Math.floor(nextValue)));
    if (next === currentValue) {
      controls.valueLabel.textContent = `${next} 名`;
      return false;
    }

    const diff = next - currentValue;
    const unitCost = Number(staffCosts[type.key]) || 0;
    const reserves = Number(finance.budget?.reserves) || 0;

    if (diff > 0) {
      const totalCost = unitCost * diff;
      if (reserves < totalCost) {
        if (controls.slider) controls.slider.value = currentValue;
        controls.valueLabel.textContent = `${currentValue} 名`;
        if (typeof showToast === 'function') {
          showToast('採用予算が不足しています。', {
            type: 'error',
            description: `必要: ${formatReserve(totalCost)} ／ 残高: ${formatReserve(reserves)}`,
            duration: 4200,
          });
        }
        return false;
      }
      finance.staff[type.key] = next;
      finance.budget.reserves = reserves - totalCost;
      logHighlight('briefcase', `【スタッフ採用】${id2name(teamId)}が${type.label}を${diff}名増員しました。`, {
        category: 'finance',
        financeType: 'staff',
        tid: teamId,
        day: state.curr_day,
      });
    } else {
      const reduction = Math.abs(diff);
      const refund = Math.round(unitCost * 0.3 * reduction);
      finance.staff[type.key] = next;
      finance.budget.reserves = reserves + refund;
      logHighlight('briefcase', `【スタッフ再編】${type.label}を${reduction}名削減し体制を見直しました。`, {
        category: 'finance',
        financeType: 'staff',
        tid: teamId,
        day: state.curr_day,
      });
    }

    if (!Array.isArray(state.devLogs)) state.devLogs = [];
    state.devLogs.push(`[${id2name(teamId)}] スタッフ構成更新: ${type.label} ${currentValue}→${next}`);

    controls.valueLabel.textContent = `${next} 名`;
    if (controls.reserveLabel) {
      const nextReserve = formatReserve(finance.budget.reserves || 0);
      controls.reserveLabel.textContent = `運転資金 ${nextReserve}`;
    }
    updateFinancialSnapshots(teamId);
    saveAndRerender();
    return true;
  }

  function buildStaffRow(context, type, finance, reserveLabel) {
    const current = Number(finance.staff?.[type.key]) || 0;
    const canControl = context.canControl;
    const row = createElement('div', { class: 'staff-slider-row' });
    const header = createElement('div', { class: 'staff-slider-header' },
      createElement('div', { class: 'staff-slider-title' },
        createElement('span', { class: 'staff-slider-name' },
          createElement('i', { 'data-lucide': type.icon, class: 'mini-icon' }),
          createElement('strong', { text: type.label })
        )
      ),
      createElement('span', { class: 'staff-slider-value', text: `${current} 名` })
    );
    const meta = createElement('div', { class: 'staff-slider-meta', text: type.description });
    const slider = createElement('input', {
      type: 'range',
      min: 0,
      max: type.max,
      step: 1,
      value: current,
      class: 'staff-slider-input',
      ...(canControl ? {} : { disabled: true })
    });

    const controls = {
      slider,
      valueLabel: header.querySelector('.staff-slider-value'),
      reserveLabel,
    };

    slider.oninput = () => {
      controls.valueLabel.textContent = `${slider.value} 名`;
    };
    slider.onchange = () => {
      adjustStaffLevel(context, type, Number(slider.value), controls);
    };

    row.append(header, meta, slider,
      createElement('div', { class: 'staff-slider-footer mini' },
        createElement('span', { text: `コスト ${formatReserve(staffCosts[type.key] || 0)} ／ 名` })
      )
    );
    if (!canControl) {
      slider.title = '自チーム以外は操作できません（コミッショナーモードで可）';
    }
    return row;
  }

  function buildView(state, context) {
    ensureTeamFinances();
    ensureTeamMeta();
    const finance = state.teamFinances?.[context.teamId];
    if (!finance) {
      return createElement('div', { class: 'front-office-empty mini', text: '財務データが見つかりません。シーズンを開始してください。' });
    }
    const reserves = Number(finance.budget?.reserves) || 0;

    const card = createElement('section', { class: 'front-office-card staff-view-card' });
    card.append(
      createElement('div', { class: 'front-office-card-header' },
        createElement('h3', {},
          createElement('i', { 'data-lucide': 'briefcase-business', class: 'mini-icon' }),
          'スタッフ配置'
        ),
        createElement('span', { class: 'pill', text: `運転資金 ${formatReserve(reserves)}` })
      )
    );

    const reserveLabel = card.querySelector('.pill');

    const grid = createElement('div', { class: 'front-office-grid' });
    STAFF_TYPES.forEach(type => {
      grid.append(buildStaffRow(context, type, finance, reserveLabel));
    });
    card.append(grid);
    return card;
  }

  function render({ container, teamId, canControl }) {
    const state = getState();
    const context = { teamId, canControl: canControl ?? canControlTeam(teamId) };
    const view = buildView(state, context);
    container.append(view);
    refreshIcons();
  }

  return { render };
}

export default createStaffView;
