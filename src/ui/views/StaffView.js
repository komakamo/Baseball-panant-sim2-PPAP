import { t } from '../../i18n/translator.js';

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
      label: t('staff.coaches.label'),
      description: t('staff.coaches.description'),
      max: 8,
    },
    {
      key: 'scouts',
      icon: 'binoculars',
      label: t('staff.scouts.label'),
      description: t('staff.scouts.description'),
      max: 8,
    },
    {
      key: 'analysts',
      icon: 'line-chart',
      label: t('staff.analysts.label'),
      description: t('staff.analysts.description'),
      max: 8,
    },
    {
      key: 'marketing',
      icon: 'megaphone',
      label: t('staff.marketing.label'),
      description: t('staff.marketing.description'),
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

  function findMaxAffordableStaff(currentValue, reserves, unitCost) {
    if (unitCost <= 0) return currentValue;
    const affordableIncrease = Math.floor(reserves / unitCost);
    return currentValue + affordableIncrease;
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
      controls.valueLabel.textContent = t('staff.count').replace('{count}', next);
      return false;
    }

    const diff = next - currentValue;
    const unitCost = Number(staffCosts[type.key]) || 0;
    const reserves = Number(finance.budget?.reserves) || 0;

    if (diff > 0) {
      const totalCost = unitCost * diff;
      if (reserves < totalCost) {
        if (controls.slider) controls.slider.value = currentValue;
        controls.valueLabel.textContent = t('staff.count').replace('{count}', currentValue);
        if (typeof showToast === 'function') {
          showToast(t('toast.staff.budget.insufficient'), {
            type: 'error',
            description: t('toast.staff.budget.insufficient.desc').replace('{required}', formatReserve(totalCost)).replace('{reserves}', formatReserve(reserves)),
            duration: 4200,
          });
        }
        return false;
      }
      finance.staff[type.key] = next;
      finance.budget.reserves = reserves - totalCost;
      logHighlight('briefcase', t('log.staff.hire').replace('{team}', id2name(teamId)).replace('{staff}', type.label).replace('{count}', diff), {
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
      logHighlight('briefcase', t('log.staff.fire').replace('{staff}', type.label).replace('{count}', reduction), {
        category: 'finance',
        financeType: 'staff',
        tid: teamId,
        day: state.curr_day,
      });
    }

    if (!Array.isArray(state.devLogs)) state.devLogs = [];
    state.devLogs.push(t('log.staff.update').replace('{team}', id2name(teamId)).replace('{staff}', type.label).replace('{from}', currentValue).replace('{to}', next));

    controls.valueLabel.textContent = t('staff.count').replace('{count}', next);
    if (controls.reserveLabel) {
      const nextReserve = formatReserve(finance.budget.reserves || 0);
      controls.reserveLabel.textContent = t('staff.reserves').replace('{reserves}', nextReserve);
    }
    updateFinancialSnapshots(teamId);
    saveAndRerender();
    return true;
  }

  function buildStaffRow(context, type, finance, reserveLabel) {
    const current = Number(finance.staff?.[type.key]) || 0;
    const canControl = context.canControl;
    const reserves = Number(finance.budget?.reserves) || 0;
    const unitCost = Number(staffCosts[type.key]) || 0;

    const row = createElement('div', { class: 'staff-slider-row' });
    const header = createElement('div', { class: 'staff-slider-header' },
      createElement('div', { class: 'staff-slider-title' },
        createElement('span', { class: 'staff-slider-name' },
          createElement('i', { 'data-lucide': type.icon, class: 'mini-icon' }),
          createElement('strong', { text: type.label })
        )
      ),
      createElement('span', { class: 'staff-slider-value', text: t('staff.count').replace('{count}', current) })
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
      const value = Number(slider.value);
      const maxAffordable = findMaxAffordableStaff(current, reserves, unitCost);
      if (value > maxAffordable) {
        slider.classList.add('warn');
        slider.title = t('tooltip.staff.budget.insufficient').replace('{max}', maxAffordable);
      } else {
        slider.classList.remove('warn');
        slider.title = '';
      }
      controls.valueLabel.textContent = t('staff.count').replace('{count}', value);
    };
    slider.onchange = () => {
      let value = Number(slider.value);
      const maxAffordable = findMaxAffordableStaff(current, reserves, unitCost);
      if (value > maxAffordable) {
        value = maxAffordable;
        slider.value = maxAffordable;
        if (typeof showToast === 'function') {
          showToast(t('toast.staff.budget.insufficient.adjusted').replace('{max}', maxAffordable), { type: 'info', duration: 4200 });
        }
      }
      adjustStaffLevel(context, type, value, controls);
    };

    row.append(header, meta, slider,
      createElement('div', { class: 'staff-slider-footer mini' },
        createElement('span', { text: t('staff.cost').replace('{cost}', formatReserve(staffCosts[type.key] || 0)) })
      )
    );
    if (!canControl) {
      slider.title = t('tooltip.facilities.notUserTeam');
    }
    return row;
  }

  function buildView(state, context) {
    ensureTeamFinances();
    ensureTeamMeta();
    const finance = state.teamFinances?.[context.teamId];
    if (!finance) {
      return createElement('div', { class: 'front-office-empty mini', text: t('staff.finance.notFound') });
    }
    const reserves = Number(finance.budget?.reserves) || 0;

    const card = createElement('section', { class: 'front-office-card staff-view-card' });
    card.append(
      createElement('div', { class: 'front-office-card-header' },
        createElement('h3', {},
          createElement('i', { 'data-lucide': 'briefcase-business', class: 'mini-icon' }),
          t('staff.title')
        ),
        createElement('span', { class: 'pill', text: t('staff.reserves').replace('{reserves}', formatReserve(reserves)) })
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

  return { render, findMaxAffordableStaff };
}

export default createStaffView;
