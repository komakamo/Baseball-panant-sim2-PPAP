import specialsJson from './specials.json' with { type: 'json' };

export function getSpecialsData() {
  return specialsJson.map(entry => ({
    ...entry,
    when: entry.when ? [...entry.when] : undefined,
    effect: entry.effect ? { ...entry.effect } : undefined,
    stackRule:
      entry.stackRule && typeof entry.stackRule === 'object'
        ? { ...entry.stackRule }
        : entry.stackRule,
  }));
}

export const SPECIALS_DATA = getSpecialsData();
