const STORE_KEY = 'pennantsim-team-selection';

const sanitizeTeamId = (teamId) => {
  const parsed = parseInt(teamId, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
};

let selectedTeamId = sanitizeTeamId(localStorage.getItem(STORE_KEY));
const subscribers = new Set();

const teamSelectionStore = {
  get: () => selectedTeamId,
  set: (teamId, { force = false } = {}) => {
    const newTeamId = sanitizeTeamId(teamId);
    if (newTeamId === null) {
      return null;
    }

    const changed = selectedTeamId !== newTeamId;
    selectedTeamId = newTeamId;
    localStorage.setItem(STORE_KEY, newTeamId);
    if (changed || force) {
      teamSelectionStore.notify();
    }
    return selectedTeamId;
  },
  subscribe: (callback) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  },
  notify: () => {
    for (const callback of subscribers) {
      callback(selectedTeamId);
    }
  }
};

export default teamSelectionStore;
