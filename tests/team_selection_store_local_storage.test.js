/** @jest-environment jsdom */
/* eslint-env jest */

describe('teamSelectionStore with browser storage', () => {
  const STORE_KEY = 'pennantsim-team-selection';

  beforeEach(() => {
    jest.resetModules();
    localStorage.clear();
  });

  it('clears selection and storage when receiving an invalid value', async () => {
    const { default: store } = await import('../src/state/team_selection_store.js');
    const removeSpy = jest.spyOn(Storage.prototype, 'removeItem');
    const subscriber = jest.fn();
    const unsubscribe = store.subscribe(subscriber);

    expect(store.set(5)).toBe(5);
    expect(localStorage.getItem(STORE_KEY)).toBe('5');

    subscriber.mockClear();

    expect(store.set('invalid')).toBeNull();
    expect(store.get()).toBeNull();
    expect(localStorage.getItem(STORE_KEY)).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith(STORE_KEY);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(null);

    unsubscribe();
    removeSpy.mockRestore();
  });
});
