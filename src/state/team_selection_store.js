const STORE_KEY = 'pennantsim-team-selection';

const sanitizeTeamId = (teamId) => {
  const parsed = parseInt(teamId, 10);
  return Number.isNaN(parsed) || parsed <= 0 ? null : parsed;
};

const createStorage = () => {
  if (typeof localStorage !== 'undefined') {
    return {
      getItem: (key) => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: (key) => localStorage.removeItem(key)
    };
  }

  const memoryStore = new Map();
  return {
    getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
    setItem: (key, value) => memoryStore.set(key, value),
    removeItem: (key) => memoryStore.delete(key)
  };
};

const storage = createStorage();

let selectedTeamId = null;
let initialized = false;
const subscribers = new Set();

const ensureInitialized = () => {
  if (initialized) return;
  selectedTeamId = sanitizeTeamId(storage.getItem(STORE_KEY));
  initialized = true;
};

const teamSelectionStore = {
  get: () => {
    ensureInitialized();
    return selectedTeamId;
  },
  set: (teamId, { force = false } = {}) => {
    ensureInitialized();
    const newTeamId = sanitizeTeamId(teamId);
    const changed = selectedTeamId !== newTeamId;
    selectedTeamId = newTeamId;
    if (newTeamId === null) {
      storage.removeItem(STORE_KEY);
    } else {
      storage.setItem(STORE_KEY, String(newTeamId));
    }
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
    ensureInitialized();
    for (const callback of subscribers) {
      callback(selectedTeamId);
    }
  }
};

export default teamSelectionStore;
