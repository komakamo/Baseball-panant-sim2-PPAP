/* eslint-env jest */

describe('teamSelectionStore without browser storage', () => {
  const originalLocalStorage = global.localStorage;

  beforeEach(() => {
    jest.resetModules();
    delete global.localStorage;
  });

  afterAll(() => {
    if (originalLocalStorage !== undefined) {
      global.localStorage = originalLocalStorage;
    } else {
      delete global.localStorage;
    }
  });

  it('imports without localStorage access', async () => {
    const { default: store } = await import('../src/state/team_selection_store.js');

    expect(store.get()).toBeNull();
  });

  it('stores selection in memory when localStorage is unavailable', async () => {
    const { default: store } = await import('../src/state/team_selection_store.js');

    expect(store.set(7)).toBe(7);
    expect(store.get()).toBe(7);
  });

  it('can immediately notify subscribers of the current selection', async () => {
    const { default: store } = await import('../src/state/team_selection_store.js');
    const subscriber = jest.fn();

    const unsubscribe = store.subscribe(subscriber, { immediate: true });

    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(null);

    store.set(9);
    expect(subscriber).toHaveBeenCalledWith(9);

    unsubscribe();
  });
});
