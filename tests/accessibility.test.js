/** @jest-environment jsdom */
import { focusTrap } from '../src/utils/accessibility.js';

describe('focusTrap', () => {
  it('returns a no-op function when element is null', () => {
    const removeTrap = focusTrap(null);

    expect(typeof removeTrap).toBe('function');
    expect(() => removeTrap()).not.toThrow();
  });

  it('does not register listeners when there are no focusable elements', () => {
    const container = document.createElement('div');
    const addEventListenerSpy = jest.spyOn(container, 'addEventListener');

    const removeTrap = focusTrap(container);

    expect(addEventListenerSpy).not.toHaveBeenCalled();
    expect(typeof removeTrap).toBe('function');
    expect(() => removeTrap()).not.toThrow();

    addEventListenerSpy.mockRestore();
  });
});
