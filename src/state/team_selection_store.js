const STORE_KEY = 'pennantsim-team-selection';

let selectedTeamId = parseInt(localStorage.getItem(STORE_KEY) || '0', 10);
const subscribers = new Set();

const teamSelectionStore = {
  get: () => selectedTeamId,
  set: (teamId) => {
    const newTeamId = parseInt(teamId, 10);
    if (selectedTeamId !== newTeamId) {
      selectedTeamId = newTeamId;
      localStorage.setItem(STORE_KEY, newTeamId);
      teamSelectionStore.notify();
    }
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
