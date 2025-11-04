// src/ui/debug_panel.js
import { formatUserActions } from '../utils/action_logger.js';

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
  });

  const toggleButton = $('#debug-panel-toggle');
  const panel = $('#debug-panel');
  if (toggleButton && panel) {
    const togglePanel = (doSave = true) => {
      const isCollapsed = panel.classList.toggle('collapsed');
      const isExpanded = !isCollapsed;
      toggleButton.setAttribute('aria-expanded', isExpanded);
      toggleButton.setAttribute('aria-label', isExpanded ? 'デバッグパネルを閉じる' : 'デバッグパネルを開く');
      if (doSave) {
        localStorage.setItem('debugPanelCollapsed', isCollapsed);
      }
    };

    toggleButton.addEventListener('click', () => togglePanel());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !panel.classList.contains('collapsed')) {
        togglePanel();
      }
    });

    // Restore state from LocalStorage
    if (localStorage.getItem('debugPanelCollapsed') === 'true') {
      togglePanel(false);
    }
  }
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

  // Initialize Jules's Debug Console
  setupJulesDebugConsole();
  julesLog('Jules debug console initialized.');
}

// We can also export functions if we need to call them from outside, e.g., for logging
export const debugLog = log;
export const refresh = updateGameStateDisplay;

// Jules's Debug Console Additions
const julesDebugLogs = [];
let julesLastError = null;
const MAX_JULES_LOGS = 50;

function julesLog(message, level = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = { timestamp, level, message };
    julesDebugLogs.push(logEntry);
    if (julesDebugLogs.length > MAX_JULES_LOGS) {
        julesDebugLogs.shift();
    }
    updateJulesLogOutput();
}

function updateJulesLogOutput() {
    const output = $('#jules-debug-log-output');
    if (output) {
        output.textContent = julesDebugLogs
            .map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`)
            .join('\n');
        output.scrollTop = output.scrollHeight;
    }
}

function updateJulesErrorOutput() {
    const output = $('#jules-debug-error-output');
    if (output) {
        if (julesLastError) {
            output.textContent = `[${julesLastError.timestamp}] ${julesLastError.message}\n\n${julesLastError.stack}`;
        } else {
            output.textContent = 'No errors recorded.';
        }
    }
}

function updateJulesActionLogOutput() {
    const output = $('#jules-debug-action-log-output');
    if (output) {
        output.textContent = formatUserActions();
    }
}

function updateJulesStateOutput() {
    const output = $('#jules-debug-state-output');
    if (output && Game.State) {
        const { curr_day, season, userTeamId, commissioner } = Game.State;
        const stage = Game.State.playoffs?.active ? 'Playoffs' : Game.State.seasonInfo?.stage || 'PRE';
        const summary = {
            day: curr_day,
            season,
            stage,
            userTeam: `${Game.id2name(userTeamId)} (${userTeamId})`,
            mode: commissioner ? 'Commissioner' : 'User',
            results: (Game.State.results || []).length,
            highlights: (Game.State.highlights || []).length,
        };
        output.textContent = Object.entries(summary)
            .map(([key, value]) => `${key}: ${value}`)
            .join('\n');
    } else if (output) {
        output.textContent = 'State not available.';
    }
}

function copyDebugInfoForAI() {
    const logOutput = julesDebugLogs.length > 0
        ? julesDebugLogs.map(log => `[${log.timestamp}] [${log.level.toUpperCase()}] ${log.message}`).join('\n')
        : 'No recent logs.';

    const errorOutput = julesLastError
        ? `Last Error at ${julesLastError.timestamp}:\n${julesLastError.message}\n${julesLastError.stack}`
        : 'No errors recorded.';

    const stateOutput = $('#jules-debug-state-output')?.textContent || 'State not available.';

    const combined = `
## PennantSim Lite Web Debug Information

### Game State Summary
\`\`\`
${stateOutput}
\`\`\`

### User Actions
\`\`\`
[UserActions]
${formatUserActions()}
[/UserActions]
\`\`\`

### Last Recorded Error
\`\`\`
${errorOutput}
\`\`\`

### Recent Logs
\`\`\`
${logOutput}
\`\`\`
`;
    navigator.clipboard.writeText(combined.trim()).then(() => {
        julesLog('Debug info copied to clipboard.', 'success');
        if (typeof window.showToast === 'function') {
            window.showToast('AIデバッグ用に情報をコピーしました', { type: 'info' });
        }
    }).catch(err => {
        julesLog(`Failed to copy to clipboard: ${err.message}`, 'error');
        if (typeof window.showToast === 'function') {
            window.showToast('コピーに失敗しました', { type: 'error', description: err.message });
        }
    });
}

function setupJulesDebugConsole() {
    const consoleEl = $('#jules-debug-console');
    if (!consoleEl) return;

    // Capture global errors
    window.addEventListener('error', (event) => {
        logUserAction('ErrorOccurred', event.message);
        julesLastError = {
            message: event.message,
            stack: event.error?.stack || 'No stack trace available.',
            timestamp: new Date().toLocaleTimeString(),
        };
        julesLog(`Uncaught error: ${event.message}`, 'error');
        updateJulesErrorOutput();
        consoleEl.classList.add('active'); // Show console on error
    });
     window.addEventListener("unhandledrejection", (ev)=>{
        const reason = ev.reason && (ev.reason.stack || ev.reason.message) || ev.reason;
        julesLastError = {
            message: `Unhandled Rejection: ${reason}`,
            stack: ev.reason?.stack || 'No stack trace available.',
            timestamp: new Date().toLocaleTimeString(),
        };
        julesLog(`Unhandled Rejection: ${reason}`, 'error');
        updateJulesErrorOutput();
        consoleEl.classList.add('active'); // Show console on error
    });


    // Override console methods
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    console.log = (...args) => {
        julesLog(args.map(a => String(a)).join(' '), 'info');
        originalLog.apply(console, args);
    };
    console.warn = (...args) => {
        julesLog(args.map(a => String(a)).join(' '), 'warn');
        originalWarn.apply(console, args);
    };
    console.error = (...args) => {
        julesLog(args.map(a => String(a)).join(' '), 'error');
        originalError.apply(console, args);
    };

    // UI Listeners
    $('#jules-debug-close-btn')?.addEventListener('click', () => {
        consoleEl.classList.remove('active');
    });

    $('#jules-debug-copy-btn')?.addEventListener('click', copyDebugInfoForAI);

    // Hotkey to toggle
    document.addEventListener('keydown', (e) => {
        if ((e.key === 'd' && e.ctrlKey) || e.key === 'F1') {
            e.preventDefault();
            consoleEl.classList.toggle('active');
            if (consoleEl.classList.contains('active')) {
                updateJulesStateOutput();
                updateJulesLogOutput();
                updateJulesErrorOutput();
                updateJulesActionLogOutput();
            }
        }
    });

    // Draggable header
    const header = $('#jules-debug-header');
    let isDragging = false;
    let offset = { x: 0, y: 0 };
    header.addEventListener('mousedown', (e) => {
        isDragging = true;
        offset.x = e.clientX - consoleEl.offsetLeft;
        offset.y = e.clientY - consoleEl.offsetTop;
        header.style.cursor = 'grabbing';
    });
    document.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        consoleEl.style.left = `${e.clientX - offset.x}px`;
        consoleEl.style.top = `${e.clientY - offset.y}px`;
        // Make sure it is not off-screen
        const rect = consoleEl.getBoundingClientRect();
        if (rect.top < 0) consoleEl.style.top = '0px';
        if (rect.left < 0) consoleEl.style.left = '0px';
        if (rect.right > window.innerWidth) consoleEl.style.left = `${window.innerWidth - rect.width}px`;
        if (rect.bottom > window.innerHeight) consoleEl.style.top = `${window.innerHeight - rect.height}px`;
    });
    document.addEventListener('mouseup', () => {
        isDragging = false;
        header.style.cursor = 'move';
    });
}
