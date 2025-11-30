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

    expect(store.set('C1')).toBe('C1');
    expect(localStorage.getItem(STORE_KEY)).toBe('C1');

    subscriber.mockClear();

    expect(store.set('')).toBeNull();
    expect(store.get()).toBeNull();
    expect(localStorage.getItem(STORE_KEY)).toBeNull();
    expect(removeSpy).toHaveBeenCalledWith(STORE_KEY);
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith(null);

    unsubscribe();
    removeSpy.mockRestore();
  });

  it('notifies new subscribers immediately when requested', async () => {
    localStorage.setItem(STORE_KEY, 'T5');

    const { default: store } = await import('../src/state/team_selection_store.js');
    const subscriber = jest.fn();

    const unsubscribe = store.subscribe(subscriber, { immediate: true });

    expect(store.get()).toBe('T5');
    expect(subscriber).toHaveBeenCalledTimes(1);
    expect(subscriber).toHaveBeenCalledWith('T5');

    unsubscribe();
  });
});
