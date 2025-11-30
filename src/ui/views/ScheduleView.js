import { t } from '../../i18n/translator.js';

export function createScheduleView({
  describeStage,
  getCalendarEntry,
  maxDay,
  id2name,
  querySelector = (selector) => document.querySelector(selector),
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
  selectors = {}
} = {}) {
  const {
    seasonLabel = '#seasonLabel',
    dayLabel = '#dayLabel',
    gamesLabel = '#gamesLabel',
    container = '#todayMatchups'
  } = selectors;

  const getNode = (selector) => querySelector(selector);

  function setText(selector, text) {
    const node = getNode(selector);
    if (node) node.textContent = text;
  }

  function renderToday(state) {
    if (!state) return;
    const day = state.curr_day || 1;
    setText(seasonLabel, t('schedule.season').replace('{season}', state.season));
    const entry = typeof getCalendarEntry === 'function' ? getCalendarEntry(state, day) : null;

    const playoffStages = state.playoffs?.stages || [];
    const playoffStageIndex = state.playoffs?.stageIndex ?? 0;
    const isFinalPlayoffStage = playoffStages.length > 0 && playoffStageIndex >= playoffStages.length - 1;
    const postStage = state.playoffs?.active ? (isFinalPlayoffStage ? 'JS' : 'CS') : (state.seasonInfo?.stage || 'POST');
    const seasonStage = state.seasonInfo?.stage || entry?.stage || 'REG';
    const currentStage = entry?.stage || (typeof maxDay === 'function' && day > maxDay()
      ? postStage
      : seasonStage);
    setText(dayLabel, t('schedule.day').replace('{day}', day).replace('{stage}', describeStage ? describeStage(currentStage) : currentStage));

    const host = getNode(container);
    if (host) host.innerHTML = '';

    const schedule = Array.isArray(state.schedule) ? state.schedule : [];
    const hasSchedule = schedule.length > 0;
    const seasonFinished = hasSchedule && typeof maxDay === 'function' ? state.curr_day > maxDay() : false;

    const appendMessage = (message) => {
      if (!host) return;
      host.append(createElement('div', {
        class: 'mini',
        style: 'padding:12px;line-height:1.6;white-space:normal;'
      }, message));
    };

    if (seasonFinished && state.playoffs?.active) {
      const stage = state.playoffs.stages?.[state.playoffs.stageIndex] || null;
      setText(gamesLabel, t('schedule.playoffs.inProgress'));
      appendMessage(stage ? t('schedule.playoffs.inProgress.desc').replace('{stage}', stage.name) : t('schedule.playoffs.inProgress.generic'));
      return;
    }

    if (seasonFinished && !state.playoffs?.started) {
      setText(gamesLabel, t('schedule.season.regular.finished'));
      appendMessage(t('schedule.season.regular.finished.desc'));
      return;
    }

    if (seasonFinished && state.playoffs?.completed) {
      const champ = state.playoffs.champion != null && typeof id2name === 'function'
        ? id2name(state.playoffs.champion)
        : null;
      setText(gamesLabel, t('schedule.season.finished'));
      appendMessage(champ ? t('schedule.season.finished.champion').replace('{champion}', champ) : t('schedule.season.finished.generic'));
      return;
    }

    const today = hasSchedule ? schedule.filter(s => s.day === day) : [];
    const gamesToday = today.filter(evt => (evt?.type || 'game') === 'game');
    const hasRest = today.some(evt => (evt?.type || 'game') === 'rest');

    if (hasRest && gamesToday.length === 0) {
      setText(gamesLabel, t('schedule.restDay'));
      appendMessage(t('schedule.restDay.desc'));
      return;
    }

    setText(gamesLabel, t('schedule.gamesToday').replace('{count}', gamesToday.length));
    if (!gamesToday.length) {
      appendMessage(hasSchedule ? t('schedule.noGamesToday') : t('schedule.notSet'));
      return;
    }

    if (!host) return;
    const table = createElement('table', {},
      createElement('thead', {},
        createElement('tr', {},
          createElement('th', {}, t('schedule.table.header.home')),
          createElement('th', {}, t('schedule.table.header.away')),
          createElement('th', {}, t('schedule.table.header.series'))
        )
      ),
      createElement('tbody')
    );

    gamesToday.forEach(game => {
      const home = typeof id2name === 'function' ? id2name(game.home_id) : String(game.home_id);
      const away = typeof id2name === 'function' ? id2name(game.away_id) : String(game.away_id);
      const seriesText = (game.seriesLength && game.seriesGame)
        ? `G${game.seriesGame}/${game.seriesLength}`
        : '-';
      table.lastChild.append(createElement('tr', {},
        createElement('td', {}, home),
        createElement('td', {}, away),
        createElement('td', {}, seriesText)
      ));
    });

    host.append(table);
  }

  return { renderToday };
}

export default createScheduleView;
