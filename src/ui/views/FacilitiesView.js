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
      label: 'トレーニングジム',
      description: 'パワー・球威・体力の成長効率を高めます。',
      max: 5,
    },
    {
      key: 'video',
      icon: 'clapperboard',
      label: 'ビデオ・ラボ',
      description: '映像分析で打撃精度・コマンドなどの伸びを後押しします。',
      max: 5,
    },
    {
      key: 'medical',
      icon: 'stethoscope',
      label: 'メディカルセンター',
      description: '回復力と故障耐性を底上げします。',
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
      controls.valueLabel.textContent = `Lv${current}`;
      return;
    }

    if (next < current) {
      if (controls.slider) controls.slider.value = current;
      controls.valueLabel.textContent = `Lv${current}`;
      if (typeof showToast === 'function') {
        showToast('施設レベルの減少はできません。', { type: 'warning', duration: 3600 });
      }
      return;
    }

    const required = calcUpgradeCost(current, next);
    const available = Number(meta.dp) || 0;
    if (required > available) {
      if (controls.slider) controls.slider.value = current;
      controls.valueLabel.textContent = `Lv${current}`;
      if (typeof showToast === 'function') {
        showToast('Devポイントが不足しています。', {
          type: 'error',
          description: `必要: ${required}pt ／ 所持: ${available}pt`,
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
    state.devLogs.push(`[${id2name(teamId)}] 施設強化: ${type.label} Lv${current}→Lv${next} (消費${required}pt)`);
    controls.valueLabel.textContent = `Lv${next}`;
    if (controls.dpLabel) {
      controls.dpLabel.textContent = `Devポイント ${meta.dp}pt`;
    }
    saveAndRerender();
  }

  function describeAdjustments(levels) {
    const adjustments = computeFacilityAdjustments(levels) || {};
    const parts = [];
    if (adjustments.growth) {
      const { battingPower, battingPrecision, pitchingPower, pitchingCommand } = adjustments.growth;
      if (battingPower != null) parts.push(`打撃パワー +${((battingPower - 1) * 100).toFixed(1)}%`);
      if (battingPrecision != null) parts.push(`打撃精度 +${((battingPrecision - 1) * 100).toFixed(1)}%`);
      if (pitchingPower != null) parts.push(`球威 +${((pitchingPower - 1) * 100).toFixed(1)}%`);
      if (pitchingCommand != null) parts.push(`コマンド +${((pitchingCommand - 1) * 100).toFixed(1)}%`);
    }
    if (adjustments.recovery) {
      const { flat, mult } = adjustments.recovery;
      if (flat) parts.push(`週回復 +${flat.toFixed(1)}`);
      if (mult && mult !== 1) parts.push(`疲労回復倍率 +${((mult - 1) * 100).toFixed(1)}%`);
    }
    if (adjustments.injuryRate != null) {
      parts.push(`故障率 ${Math.round((1 - adjustments.injuryRate) * 100)}%軽減`);
    }
    return parts.filter(Boolean);
  }

  function buildFacilityRow(state, context, type, facilities, controls) {
    const level = Number(facilities?.[type.key]) || 0;
    const canControl = context.canControl;
    const row = createElement('div', { class: 'facility-slider-row' });
    const header = createElement('div', { class: 'facility-slider-header' },
      createElement('div', { class: 'facility-slider-title' },
        createElement('span', { class: 'facility-slider-name' },
          createElement('i', { 'data-lucide': type.icon, class: 'mini-icon' }),
          createElement('strong', { text: type.label })
        )
      ),
      createElement('span', { class: 'facility-slider-value', text: `Lv${level}` })
    );
    const description = createElement('div', { class: 'facility-slider-meta', text: type.description });
    const effects = createElement('ul', { class: 'facility-slider-effects' });

    const updateEffectPreview = (value) => {
      const effectList = describeAdjustments({ ...facilities, [type.key]: value });
      effects.innerHTML = '';
      if (!effectList.length) {
        effects.append(createElement('li', { text: '効果データを計算できません。' }));
        return;
      }
      effectList.forEach(item => {
        effects.append(createElement('li', { text: item }));
      });
    };
    updateEffectPreview(level);

    const slider = createElement('input', {
      type: 'range',
      min: level,
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
      const value = Number(slider.value);
      controlRefs.valueLabel.textContent = `Lv${value}`;
      updateEffectPreview(value);
    };
    slider.onchange = () => {
      applyFacilityLevel(state, context, type, Number(slider.value), controlRefs);
    };

    row.append(header, description, slider, effects,
      createElement('div', { class: 'facility-slider-footer mini' },
        createElement('span', { text: `最大Lv${type.max} ／ 1段階 ${20 + level * 10}pt〜` })
      )
    );
    if (!canControl) {
      slider.title = '自チーム以外は操作できません（コミッショナーモードで可）';
    }
    return row;
  }

  function buildView(state, context) {
    ensureTeamMeta();
    const meta = state.teamMeta?.[context.teamId];
    if (!meta) {
      return createElement('div', { class: 'front-office-empty mini', text: 'チームメタ情報が見つかりません。' });
    }
    const facilities = ensureTeamFacilities(meta, context.teamId);
    const dp = Number(meta.dp) || 0;

    const card = createElement('section', { class: 'front-office-card facilities-view-card' });
    card.append(
      createElement('div', { class: 'front-office-card-header' },
        createElement('h3', {},
          createElement('i', { 'data-lucide': 'factory', class: 'mini-icon' }),
          '施設投資'
        ),
        createElement('span', { class: 'pill', text: `Devポイント ${dp}pt` })
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

  return { render };
}

export default createFacilitiesView;
