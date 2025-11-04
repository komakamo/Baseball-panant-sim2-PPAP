import { t } from '../../i18n/translator.js';

export function createFacilitiesView({
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
  ensureTeamMeta,
  ensureTeamFacilities,
  updateTeamFacilities = () => {},
  computeFacilityAdjustments = () => ({}),
  id2name = id => `Team ${id}`,
  actions = {},
  refreshIcons = () => {},
} = {}) {
  if (typeof ensureTeamMeta !== 'function') {
    throw new Error('FacilitiesView requires ensureTeamMeta.');
  }
  if (typeof ensureTeamFacilities !== 'function') {
    throw new Error('FacilitiesView requires ensureTeamFacilities.');
  }
  if (!actions || typeof actions.saveAndRerender !== 'function') {
    throw new Error('FacilitiesView requires actions.saveAndRerender.');
  }

  const {
    saveAndRerender,
    canControlTeam = () => false,
    showToast = null,
  } = actions;

  const FACILITIES = [
    {
      key: 'gym',
      icon: 'dumbbell',
      label: t('facilities.gym.label'),
      description: t('facilities.gym.description'),
      max: 5,
    },
    {
      key: 'video',
      icon: 'clapperboard',
      label: t('facilities.video.label'),
      description: t('facilities.video.description'),
      max: 5,
    },
    {
      key: 'medical',
      icon: 'stethoscope',
      label: t('facilities.medical.label'),
      description: t('facilities.medical.description'),
      max: 5,
    },
  ];

  function calcUpgradeCost(from, to) {
    if (to <= from) return 0;
    let cost = 0;
    for (let level = from; level < to; level += 1) {
      cost += 20 + level * 10;
    }
    return cost;
  }

  function ensureDevLog(state) {
    if (!Array.isArray(state.devLogs)) {
      state.devLogs = [];
    }
  }

  function applyFacilityLevel(state, context, type, nextLevel, controls) {
    const { teamId } = context;
    ensureTeamMeta();
    const meta = state.teamMeta?.[teamId];
    if (!meta) return;
    const facilities = ensureTeamFacilities(meta, teamId);
    const current = Number(facilities?.[type.key]) || 0;
    const next = Math.max(0, Math.min(type.max, Math.floor(nextLevel)));
    if (next === current) {
      controls.valueLabel.textContent = t('facilities.level').replace('{level}', current);
      return;
    }

    if (next < current) {
      if (controls.slider) controls.slider.value = current;
      controls.valueLabel.textContent = t('facilities.level').replace('{level}', current);
      if (typeof showToast === 'function') {
        showToast(t('toast.facilities.downgrade.disabled'), { type: 'warning', duration: 3600 });
      }
      return;
    }

    const required = calcUpgradeCost(current, next);
    const available = Number(meta.dp) || 0;
    if (required > available) {
      if (controls.slider) controls.slider.value = current;
      controls.valueLabel.textContent = t('facilities.level').replace('{level}', current);
      if (typeof showToast === 'function') {
        showToast(t('toast.facilities.dp.insufficient'), {
          type: 'error',
          description: t('toast.facilities.dp.insufficient.desc').replace('{required}', required).replace('{available}', available),
          duration: 4200,
        });
      }
      return;
    }

    meta.dp = available - required;
    facilities[type.key] = next;
    if (type.key === 'medical') {
      facilities.recovery = next;
    }
    meta.facilities = facilities;
    updateTeamFacilities(teamId, facilities);
    ensureDevLog(state);
    state.devLogs.push(t('log.facilities.upgrade')
      .replace('{team}', id2name(teamId))
      .replace('{facility}', type.label)
      .replace('{from}', current)
      .replace('{to}', next)
      .replace('{cost}', required));
    controls.valueLabel.textContent = t('facilities.level').replace('{level}', next);
    if (controls.dpLabel) {
      controls.dpLabel.textContent = t('facilities.devPoints').replace('{dp}', meta.dp);
    }
    saveAndRerender();
  }

  function describeAdjustments(levels) {
    const adjustments = computeFacilityAdjustments(levels) || {};
    const parts = [];
    if (adjustments.growth) {
      const { battingPower, battingPrecision, pitchingPower, pitchingCommand } = adjustments.growth;
      if (battingPower != null) parts.push(t('effects.battingPower').replace('{value}', ((battingPower - 1) * 100).toFixed(1)));
      if (battingPrecision != null) parts.push(t('effects.battingPrecision').replace('{value}', ((battingPrecision - 1) * 100).toFixed(1)));
      if (pitchingPower != null) parts.push(t('effects.pitchingPower').replace('{value}', ((pitchingPower - 1) * 100).toFixed(1)));
      if (pitchingCommand != null) parts.push(t('effects.pitchingCommand').replace('{value}', ((pitchingCommand - 1) * 100).toFixed(1)));
    }
    if (adjustments.recovery) {
      const { flat, mult } = adjustments.recovery;
      if (flat) parts.push(t('effects.weeklyRecovery').replace('{value}', flat.toFixed(1)));
      if (mult && mult !== 1) parts.push(t('effects.fatigueRecovery').replace('{value}', ((mult - 1) * 100).toFixed(1)));
    }
    if (adjustments.injuryRate != null) {
      parts.push(t('effects.injuryRate').replace('{value}', Math.round((1 - adjustments.injuryRate) * 100)));
    }
    return parts.filter(Boolean);
  }

  function findMaxAffordableLevel(currentLevel, maxLevel, availableDp) {
    if (availableDp <= 0) return currentLevel;
    let cost = 0;
    for (let i = currentLevel; i < maxLevel; i++) {
      const costForNextLevel = 20 + i * 10;
      if (cost + costForNextLevel > availableDp) {
        return i;
      }
      cost += costForNextLevel;
    }
    return maxLevel;
  }

  function buildFacilityRow(state, context, type, facilities, controls) {
    const level = Number(facilities?.[type.key]) || 0;
    const canControl = context.canControl;
    const meta = state.teamMeta?.[context.teamId];
    const dp = Number(meta?.dp) || 0;
    const row = createElement('div', { class: 'facility-slider-row' });
    const header = createElement('div', { class: 'facility-slider-header' },
      createElement('div', { class: 'facility-slider-title' },
        createElement('span', { class: 'facility-slider-name' },
          createElement('i', { 'data-lucide': type.icon, class: 'mini-icon' }),
          createElement('strong', { text: type.label })
        )
      ),
      createElement('span', { class: 'facility-slider-value', text: t('facilities.level').replace('{level}', level) })
    );
    const description = createElement('div', { class: 'facility-slider-meta', text: type.description });
    const effects = createElement('ul', { class: 'facility-slider-effects' });

    const updateEffectPreview = (value) => {
      const effectList = describeAdjustments({ ...facilities, [type.key]: value });
      effects.innerHTML = '';
      if (!effectList.length) {
        effects.append(createElement('li', { text: t('effects.calculation.error') }));
        return;
      }
      effectList.forEach(item => {
        effects.append(createElement('li', { text: item }));
      });
    };
    updateEffectPreview(level);

    const slider = createElement('input', {
      type: 'range',
      min: 0,
      max: type.max,
      step: 1,
      value: level,
      class: 'facility-slider-input',
      ...(canControl ? {} : { disabled: true })
    });

    const controlRefs = {
      slider,
      valueLabel: header.querySelector('.facility-slider-value'),
      dpLabel: controls.dpLabel,
    };

    slider.oninput = () => {
      let value = Number(slider.value);
      if (value < level) {
        value = level;
        slider.value = level;
        slider.title = t('tooltip.facilities.downgrade.disabled');
      } else {
        slider.title = '';
      }

      const maxAffordable = findMaxAffordableLevel(level, type.max, dp);
      if (value > maxAffordable) {
        slider.classList.add('warn');
        slider.title = t('tooltip.facilities.dp.insufficient').replace('{max}', maxAffordable);
      } else {
        slider.classList.remove('warn');
        if (value < level) {
          slider.title = t('tooltip.facilities.downgrade.disabled');
        } else {
          slider.title = '';
        }
      }

      controlRefs.valueLabel.textContent = t('facilities.level').replace('{level}', value);
      updateEffectPreview(value);
    };
    slider.onchange = () => {
      let value = Number(slider.value);
      const maxAffordable = findMaxAffordableLevel(level, type.max, dp);
      if (value > maxAffordable) {
        value = maxAffordable;
        slider.value = maxAffordable;
        if (typeof showToast === 'function') {
          showToast(t('toast.facilities.dp.insufficient.desc').replace('{required}', '').replace('{available}', maxAffordable), { type: 'info', duration: 4200 });
        }
      }
      applyFacilityLevel(state, context, type, value, controlRefs);
    };

    row.append(header, description, slider, effects,
      createElement('div', { class: 'facility-slider-footer mini' },
        createElement('span', { text: `${t('facilities.maxLevel').replace('{max}', type.max)} ／ ${t('facilities.upgrade.cost').replace('{cost}', 20 + level * 10)}` })
      )
    );
    if (!canControl) {
      slider.title = t('tooltip.facilities.notUserTeam');
    }
    return row;
  }

  function buildView(state, context) {
    ensureTeamMeta();
    const meta = state.teamMeta?.[context.teamId];
    if (!meta) {
      return createElement('div', { class: 'front-office-empty mini', text: t('facilities.teamMeta.notFound') });
    }
    const facilities = ensureTeamFacilities(meta, context.teamId);
    const dp = Number(meta.dp) || 0;

    const card = createElement('section', { class: 'front-office-card facilities-view-card' });
    card.append(
      createElement('div', { class: 'front-office-card-header' },
        createElement('h3', {},
          createElement('i', { 'data-lucide': 'factory', class: 'mini-icon' }),
          t('facilities.title')
        ),
        createElement('span', { class: 'pill', text: t('facilities.devPoints').replace('{dp}', dp) })
      )
    );

    const dpLabel = card.querySelector('.pill');

    const grid = createElement('div', { class: 'front-office-grid' });
    FACILITIES.forEach(type => {
      grid.append(buildFacilityRow(state, context, type, facilities, { dpLabel }));
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

  return { render, findMaxAffordableLevel };
}

export default createFacilitiesView;
