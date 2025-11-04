import glossary from './ja/glossary.json' with { type: 'json' };
import main from './ja/main.json' with { type: 'json' };

const dictionary = { ...glossary, ...main };

/**
 * A simple translator function.
 * @param {string} key The key to look up in the dictionary.
 * @returns {string} The translated string, or the key if not found.
 */
export function t(key) {
  return dictionary[key] || key;
}
