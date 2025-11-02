const rulesets = {
  'npb-2025': {
    id: 'npb-2025',
    name: 'NPB (2025)',
    description: '9回制、延長12回まで、引き分けあり。',
    innings: 9,
    extraInnings: 3,
    allowTie: true,
    ghostRunner: false,
    dh: 'auto',
    winningPercentage: 'npb',
  },
  'npb-cl': {
    id: 'npb-cl',
    name: 'NPB-CL',
    description: 'NPBルール、DHなし。',
    innings: 9,
    extraInnings: 3,
    allowTie: true,
    ghostRunner: false,
    dh: false,
    winningPercentage: 'npb',
  },
  'npb-pl': {
    id: 'npb-pl',
    name: 'NPB-PL',
    description: 'NPBルール、DHあり。',
    innings: 9,
    extraInnings: 3,
    allowTie: true,
    ghostRunner: false,
    dh: true,
    winningPercentage: 'npb',
  },
  'mlb-rs': {
    id: 'mlb-rs',
    name: 'MLB-RS',
    description: '9回制、延長10回からゴーストランナー、引き分けなし、DHあり。',
    innings: 9,
    extraInnings: Infinity,
    allowTie: false,
    ghostRunner: true,
    ghostRunnerInning: 10,
    dh: true,
    winningPercentage: 'mlb',
  },
  'mlb-post': {
    id: 'mlb-post',
    name: 'MLB-POST',
    description: '9回制、延長無制限、ゴーストランナーなし、引き分けなし、DHあり。',
    innings: 9,
    extraInnings: Infinity,
    allowTie: false,
    ghostRunner: false,
    dh: true,
    winningPercentage: 'mlb',
  },
};

export const getRulesetById = (id) => {
  return rulesets[id] || rulesets['npb-2025'];
};

export const getAllRulesets = () => {
  return Object.values(rulesets);
};

export default rulesets;
