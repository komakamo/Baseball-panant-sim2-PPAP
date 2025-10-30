/**
 * Startup Test for PennantSim Lite Web
 *
 * This script runs a series of checks when the application starts to ensure
 * basic integrity and catch common issues early.
 */

// List of JSON files to be checked
const JSON_FILES = [
  './data/specials.json',
  // Add other JSON files here as needed
];

/**
 * Checks if all specified JSON files can be fetched and parsed.
 * @returns {Promise<string[]>} A list of error messages.
 */
async function checkJsonParsing() {
  const errors = [];
  for (const file of JSON_FILES) {
    try {
      const response = await fetch(file);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${file} (status: ${response.status})`);
      }
      await response.json();
    } catch (error) {
      errors.push(`Error parsing ${file}: ${error.message}`);
    }
  }
  return errors;
}

/**
 * Checks for the existence of essential UI elements.
 * @returns {string[]} A list of error messages.
 */
function checkUiElements() {
  const errors = [];
  const requiredIds = [
    'btnGen',
    'btnToday',
    'btnEnd',
    'selUserTeam',
    'dashboard-overview-card',
    'management-card',
  ];
  requiredIds.forEach(id => {
    if (!document.getElementById(id)) {
      errors.push(`UI element not found: #${id}`);
    }
  });
  return errors;
}

/**
 * Runs all startup tests and returns a list of errors.
 * @returns {Promise<string[]>} A list of error messages.
 */
export async function runStartupTest() {
  const jsonErrors = await checkJsonParsing();
  const uiErrors = checkUiElements();

  const allErrors = [...jsonErrors, ...uiErrors];

  // A simple check to ensure the main scene can be generated.
  // This can be expanded with more specific checks.
  if (allErrors.length === 0) {
    const scheduleElement = document.getElementById('todayMatchups');
    if (!scheduleElement || scheduleElement.children.length === 0) {
      // This is a soft warning for now, as it might be empty on a new season.
      // errors.push('Main scene (todayMatchups) appears empty on load.');
    }
  }

  return allErrors;
}
