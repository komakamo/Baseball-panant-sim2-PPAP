/** @jest-environment jsdom */

import { createDraftView } from '../src/ui/views/DraftView.js';
import { t } from '../src/i18n/translator.js';

describe('DraftView first-round bidding', () => {
  function renderWithPending({ pending, userTeamId, isCommissioner = false }) {
    const draft = {
      active: true,
      round: 1,
      rounds: 3,
      direction: 1,
      pool: [
        {
          pid: 101,
          type: 'BAT',
          name: 'Future Star',
          age: 19,
          pos: 'CF',
          hand: 'R',
          pot: 70,
        }
      ],
      bids: [],
    };

    const state = {
      draft,
      teamMeta: {
        1: {
          scouting: {
            assignments: {},
          },
        },
      },
    };

    const submitBid = jest.fn();
    const saveState = jest.fn();
    const saveAndRerender = jest.fn();

    const view = createDraftView({
      getState: () => state,
      ensureDraft: () => draft,
      ensureTeamMeta: jest.fn(),
      ensureTeamNeedsAll: jest.fn(),
      ensureProspectStructure: jest.fn(),
      id2name: id => `Team ${id}`,
      actions: {
        submitBid,
        selectProspect: jest.fn(),
        shouldResolveFirstRound: () => false,
        processFirstRoundResolution: jest.fn(),
        checkDraftCompletion: jest.fn(),
        getPendingTeams: () => pending.slice(),
        getOnClockTeam: () => null,
        isDraftComplete: () => false,
        autoUntilUser: jest.fn(),
        autoDraftStep: jest.fn(),
        saveAndRerender,
        saveState,
      },
      refreshIcons: jest.fn(),
    });

    const container = document.createElement('div');
    view.render({ container, teamId: 1, userTeamId, isCommissioner });

    return { container, submitBid, saveState, saveAndRerender };
  }

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('allows pending teams to submit bids even if not first in line', () => {
    const pending = [2, 1];
    const { container, submitBid, saveState, saveAndRerender } = renderWithPending({ pending, userTeamId: 1 });

    const bidButton = [...container.querySelectorAll('button')]
      .find(btn => btn.textContent === t('action.bid'));

    expect(bidButton).toBeTruthy();
    expect(bidButton.disabled).toBe(false);

    bidButton.onclick();

    expect(submitBid).toHaveBeenCalledWith(1, 101);
    expect(saveState).toHaveBeenCalled();
    expect(saveAndRerender).toHaveBeenCalled();
  });

  it('disables bidding when the team is no longer pending', () => {
    const pending = [2];
    const { container } = renderWithPending({ pending, userTeamId: 1 });

    const bidButton = [...container.querySelectorAll('button')]
      .find(btn => btn.textContent === t('action.bid'));

    expect(bidButton).toBeTruthy();
    expect(bidButton.disabled).toBe(true);
    expect(bidButton.title).toBe(t('tooltip.notYourTurn'));
  });
});
