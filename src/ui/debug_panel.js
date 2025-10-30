// src/ui/debug_panel.js

// Helper functions to access the main game state and actions
// These will be initialized from the main script.
let Game = {
  State: null,
  advanceDay: () => console.warn('Debug action advanceDay not initialized'),
  advanceToEnd: () => console.warn('Debug action advanceToEnd not initialized'),
  updateAll: () => console.warn('Debug action updateAll not initialized'),
  id2name: (id) => `Team ${id}`,
  applyNarrativeEvent: () => console.warn('applyNarrativeEvent not initialized'),
};

const $ = (s) => document.querySelector(s);

function log(message) {
  const viewer = $('#debug-log-viewer');
  if (viewer) {
    const line = document.createElement('div');
    line.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    viewer.appendChild(line);
    viewer.scrollTop = viewer.scrollHeight;
  }
  console.log(`[DEBUG] ${message}`);
}

function updateGameStateDisplay() {
  const display = $('#debug-gamestate');
  if (display && Game.State) {
    const stage = Game.State.playoffs?.active ? 'Playoffs' : Game.State.seasonInfo?.stage || 'PRE';
    display.textContent = `Scene: ${stage} / Turn: ${Game.State.curr_day || 0} / Season: ${Game.State.season || 0}`;
  }
}

function setupEventListeners() {
  $('#debug-adv-day')?.addEventListener('click', () => {
    log('Advancing 1 day...');
    Game.advanceDay();
  });

  $('#debug-adv-season')?.addEventListener('click', () => {
    log('Advancing to end of season...');
    Game.advanceToEnd();
  });

  $('#debug-skip-games')?.addEventListener('click', () => {
    log('Skipping day...');
    Game.advanceDay();
  });

  $('#debug-add-money')?.addEventListener('click', () => {
    if (!Game.State) return;
    const tid = Game.State.userTeamId ?? 0;
    const finance = Game.State.teamFinances?.[tid];
    if (finance) {
      const amount = 10000;
      finance.budget.reserves = (finance.budget.reserves || 0) + amount;
      log(`Added ¥${amount.toLocaleString()} to ${Game.id2name(tid)}.`);
      Game.updateAll();
    } else {
      log(`Could not find finances for team ${tid}.`);
    }
  });

  $('#debug-reveal-players')?.addEventListener('click', () => {
    if (!Game.State) return;
    log('Revealing all player potentials...');
    Object.values(Game.State.rosters || {}).forEach(roster => {
        [...(roster.bats || []), ...(roster.pits || [])].forEach(p => {
            if (p) p.farmReveal = 100;
        });
    });
    (Game.State.draft?.pool || []).forEach(prospect => {
      if (prospect?.scouting?.teams) {
        Object.keys(prospect.scouting.teams).forEach(tid => {
          prospect.scouting.teams[tid].progress = 1;
        });
      }
    });
    log('All player potentials have been revealed.');
    Game.updateAll();
  });

  $('#debug-force-event')?.addEventListener('click', () => {
    if (!Game.State || !Game.applyNarrativeEvent) {
      log('Game state not ready for forcing events.');
      return;
    }
    const tid = Game.State.userTeamId ?? 0;
    const teamName = Game.id2name(tid);
    const event = {
      teamId: tid,
      title: 'デバッグイベント',
      summary: `${teamName}でデバッグ用のイベントが強制発火されました。`,
      detail: 'これはテスト目的のイベントで、チームの士気が少し上昇します。',
      effects: { morale: 5 },
      icon: 'bug',
      tag: 'DEBUG',
    };
    log(`Forcing narrative event for ${teamName}...`);
    Game.applyNarrativeEvent(event);
    Game.updateAll();
  });
}

/**
 * Initializes the debug panel functionality.
 * @param {object} gameInterface - An object providing access to the main game state and actions.
 */
export function init(gameInterface) {
  // Don't initialize if the panel doesn't exist
  if (!$('#debug-panel')) {
    return;
  }

  Game = { ...Game, ...gameInterface };
  log('Debug panel initialized.');
  setupEventListeners();
  updateGameStateDisplay();

  // Periodically update the game state display
  setInterval(updateGameStateDisplay, 2000);
}

// We can also export functions if we need to call them from outside, e.g., for logging
export const debugLog = log;
export const refresh = updateGameStateDisplay;
