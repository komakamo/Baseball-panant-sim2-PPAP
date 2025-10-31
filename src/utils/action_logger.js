// src/utils/action_logger.js

const MAX_ACTIONS = 20;
const userActions = [];

/**
 * Logs a user action.
 * @param {string} type - The type of action (e.g., 'ButtonClick', 'SceneChanged').
 * @param {string} details - Details about the action.
 */
export function logUserAction(type, details) {
  if (userActions.length >= MAX_ACTIONS) {
    userActions.shift();
  }
  userActions.push({
    timestamp: new Date().toISOString(),
    type,
    details,
  });
}

/**
 * Retrieves the logged user actions.
 * @returns {Array} A copy of the user actions array.
 */
export function getUserActions() {
  return [...userActions];
}

/**
 * Formats the user actions for display.
 * @returns {string} The formatted user actions.
 */
export function formatUserActions() {
  return userActions
    .map((action, index) => `${index + 1}. ${action.type} -> "${action.details}"`)
    .join('\n');
}
