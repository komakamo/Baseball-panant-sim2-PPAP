
import Draft from './draft.js';

const {
  isDraftComplete,
  shouldResolveFirstRound,
  resolveFirstRound,
  getDraftPendingTeams,
  submitBid,
  getDraftOnClockTeamId,
  selectDraftProspect,
} = Draft;

export function evaluateProspectBase(p, ensureProspectStructure) {
  ensureProspectStructure(p);
  const r = p.trueRatings || {};
  if (p.type === 'BAT') {
    return r.pot * 1.1 + r.pwr * 0.4 + r.con * 0.4 + r.spd * 0.2;
  } else {
    return r.pot * 1.1 + r.velo * 0.35 + r.mov * 0.35 + r.ctrl * 0.25 + (p.role === 'SP' ? 5 : 0);
  }
}

export function prospectNeedBucket(prospect, getDraftProspectNeedCategory, ensureProspectStructure) {
  ensureProspectStructure(prospect);
  const bucket = getDraftProspectNeedCategory(prospect);
  if (bucket) return bucket;
  if (prospect.type === 'PIT') {
    const role = (prospect.role || prospect.pos || '').toUpperCase();
    return role === 'SP' ? 'SP' : 'RP';
  }
  const pos = (prospect.pos || '').toUpperCase();
  if (pos === 'C') return 'C';
  if (['LF', 'CF', 'RF', 'OF'].includes(pos)) return 'OF';
  return 'IF';
}

export function evaluateProspectForTeam(prospect, teamId, State, { ensureProspectStructure, ensureTeamNeedsAll, clamp }) {
  ensureProspectStructure(prospect);
  const base = evaluateProspectBase(prospect, ensureProspectStructure);
  if (teamId == null) {
    return base;
  }
  ensureTeamNeedsAll();
  const team = State.teams?.find(t => t.team_id === teamId);
  if (!team) {
    return base;
  }
  const bucket = prospectNeedBucket(prospect, ()=>{}, ensureProspectStructure);
  const need = clamp((team.needs?.[bucket]) ?? 0, 0, 1.5);
  let score = base * (1 + need * 0.45);
  if (prospect.potRange) {
    const range = prospect.potRange;
    const spread = clamp((range.max - range.min), 0, 30);
    score += spread * 0.12;
    const mid = (range.min + range.max) / 2;
    score += (mid - base) * 0.05;
  }
  if (typeof prospect.signWillingness === 'number') {
    score *= 1 + clamp((prospect.signWillingness - 60) / 220, -0.25, 0.35);
  }
  if (typeof prospect.riskInjury === 'number') {
    score *= 1 - clamp((prospect.riskInjury - 50) / 220, -0.3, 0.3);
  }
  return score;
}

export function chooseBestProspectForTeam(teamId, State, { evaluateProspectForTeam, ensureProspectStructure, ensureTeamNeedsAll, clamp }) {
    const draft = State.draft;
    const pool = draft.pool || [];
    let best = null, bestScore = -Infinity;
    for (const prospect of pool) {
        const score = evaluateProspectForTeam(prospect, teamId, State, { ensureProspectStructure, ensureTeamNeedsAll, clamp }) + Math.random() * 3;
        if (score > bestScore) {
            bestScore = score;
            best = prospect;
        }
    }
    return best;
}

export function getNextDraftActor(State) {
    const draft = State.draft;
    if (draft.round === 1) {
        const pending = getDraftPendingTeams(State);
        return pending.length > 0 ? pending[0] : null;
    }
    return getDraftOnClockTeamId(State);
}

export function autoDraftStep(stopTeamId, State, {
    showToast,
    chooseBestProspectForTeam,
    completeDraftSelection,
    checkDraftCompletion,
    handleDraftEvent,
    evaluateProspectForTeam,
    ensureProspectStructure,
    ensureTeamNeedsAll,
    clamp
}) {
    if (!State.draft.active) return false;
    if (isDraftComplete(State)) {
        checkDraftCompletion();
        return false;
    }

    if (State.draft.round === 1) {
        if (shouldResolveFirstRound(State)) {
            const result = resolveFirstRound(State, { random: Math.random, onLog: handleDraftEvent });
            result.winners.forEach(entry => {
                completeDraftSelection(entry.teamId, { prospect: entry.prospect, selection: entry.selection });
            });
            checkDraftCompletion();
            return result.winners.length > 0;
        }
        const pending = getDraftPendingTeams(State);
        if (pending.length === 0) return false;
        const teamId = pending[0];
        if (teamId == null) {
            showToast('エラー: 次の指名チームIDが見つかりません。', { type: 'error' });
            return false;
        }
        if (stopTeamId != null && !State.commissioner && teamId === stopTeamId) return false;

        const best = chooseBestProspectForTeam(teamId, State, { evaluateProspectForTeam, ensureProspectStructure, ensureTeamNeedsAll, clamp });
        if (!best) return false;
        submitBid(State, teamId, best.pid);

        if (shouldResolveFirstRound(State)) {
            const result = resolveFirstRound(State, { random: Math.random, onLog: handleDraftEvent });
            result.winners.forEach(entry => {
                completeDraftSelection(entry.teamId, { prospect: entry.prospect, selection: entry.selection });
            });
            checkDraftCompletion();
        }
        return true;
    }

    const teamId = getDraftOnClockTeamId(State);
    if (teamId == null) {
        showToast('エラー: 次の指名チームIDが見つかりません。', { type: 'error' });
        checkDraftCompletion();
        return false;
    }
    if (stopTeamId != null && !State.commissioner && teamId === stopTeamId) return false;

    const best = chooseBestProspectForTeam(teamId, State, { evaluateProspectForTeam, ensureProspectStructure, ensureTeamNeedsAll, clamp });
    if (!best) {
        checkDraftCompletion();
        return false;
    }

    const result = selectDraftProspect(State, teamId, best.pid, { onLog: handleDraftEvent });
    if (result) {
        completeDraftSelection(teamId, result);
        checkDraftCompletion();
        return true;
    }
    return false;
}

export function autoUntilUserTurn(userTid, State, dependencies) {
    let safety = 1000;
    while (State.draft.active && !isDraftComplete(State) && safety-- > 0) {
        const next = getNextDraftActor(State);
        if (next == null) {
            if (State.draft.round === 1 && shouldResolveFirstRound(State)) {
                const result = resolveFirstRound(State, { random: Math.random, onLog: dependencies.handleDraftEvent });
                result.winners.forEach(entry => {
                    dependencies.completeDraftSelection(entry.teamId, { prospect: entry.prospect, selection: entry.selection });
                });
                dependencies.checkDraftCompletion();
                continue;
            }
            break;
        }
        if (!State.commissioner && next === userTid) break;
        if (!autoDraftStep(userTid, State, dependencies)) break;
    }
}
