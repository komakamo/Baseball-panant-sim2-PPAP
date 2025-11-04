// src/utils/accessibility.js

/**
 * Traps focus within a given element.
 * @param {HTMLElement} element - The element to trap focus within.
 * @returns {Function} A function to remove the focus trap.
 */
export function focusTrap(element) {
  const focusableElements = element.querySelectorAll(
    'a[href], button, input, textarea, select, details, [tabindex]:not([tabindex="-1"])'
  );
  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  function handleKeyDown(event) {
    if (event.key !== 'Tab') return;

    if (event.shiftKey) {
      if (document.activeElement === firstFocusable) {
        lastFocusable.focus();
        event.preventDefault();
      }
    } else {
      if (document.activeElement === lastFocusable) {
        firstFocusable.focus();
        event.preventDefault();
      }
    }
  }

  element.addEventListener('keydown', handleKeyDown);

  return function removeFocusTrap() {
    element.removeEventListener('keydown', handleKeyDown);
  };
}

/**
 * Implements roving tabindex for a list of elements.
 * @param {HTMLElement} container - The container of the list.
 * @param {string} selector - The selector for the list items.
 */
export function rovingTabIndex(container, selector) {
  const items = container.querySelectorAll(selector);
  if (items.length === 0) return;

  items.forEach((item, index) => {
    item.setAttribute('tabindex', index === 0 ? '0' : '-1');
  });

  function handleKeyDown(event) {
    const currentItem = event.target.closest(selector);
    if (!currentItem || !container.contains(currentItem)) return;

    let newIndex;

    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      newIndex = Array.from(items).indexOf(currentItem) + 1;
      if (newIndex >= items.length) newIndex = 0;
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      newIndex = Array.from(items).indexOf(currentItem) - 1;
      if (newIndex < 0) newIndex = items.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    items.forEach((item) => item.setAttribute('tabindex', '-1'));
    items[newIndex].setAttribute('tabindex', '0');
    items[newIndex].focus();
  }

  container.addEventListener('keydown', handleKeyDown);
}
