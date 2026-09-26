const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const DIGEST = /^[a-f0-9]{64}$/;

function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} must have exactly: ${keys.join(', ')}.`);
  }
}
function commit(value, label) {
  if (typeof value !== 'string' || !SHA.test(value)) throw new TypeError(`${label} is not a Git object ID.`);
}
function digest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new TypeError(`${label} is not a SHA-256 digest.`);
}
function date(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new TypeError(`${label} is not a timestamp.`);
  return Date.parse(value);
}
function binding(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} differs from the exact candidate.`);
}
function isVerified(value) { return value?.status === 'verified'; }

/**
 * Deterministically evaluates v0.5.1 OWNER_ADDITION adoption from facts
 * supplied by a trusted adapter. The adapter is responsible for establishing
 * `status: "verified"`; this function checks its explicit provenance bindings
 * and lifecycle ordering, and never authenticates a producer from its name.
 *
 * Shape: { candidate, procedure, ordinaryDecision, authoritySet, eligibility,
 * eligibilityEvidence, merge, targetReadback }. A missing merge/readback leaves
 * the corresponding lifecycle result pending. Malformed evidence throws.
 */
export function evaluateOwnerAdditionAdoption(input) {
  exact(input, ['candidate', 'procedure', 'ordinaryDecision', 'authoritySet', 'eligibility',
    'eligibilityEvidence', 'merge', 'targetReadback'], 'adoption input');
  const c = input.candidate;
  exact(c, ['repository', 'targetBranch', 'pullRequest', 'baseSha', 'bSha', 'bTree', 'authorityDigest'], 'candidate');
  exact(c.pullRequest, ['number'], 'candidate pull request');
  if (typeof c.repository !== 'string' || !c.repository || typeof c.targetBranch !== 'string' || !c.targetBranch ||
      !Number.isSafeInteger(c.pullRequest.number) || c.pullRequest.number < 1) throw new TypeError('Candidate identity is invalid.');
  commit(c.baseSha, 'Candidate base'); commit(c.bSha, 'Candidate B'); commit(c.bTree, 'Candidate B tree');
  digest(c.authorityDigest, 'Candidate authority digest');

  let eligibility = 'incomplete';
  let eligibilityError;
  let eligibilityUnavailable = false;
  try {
    const p = input.procedure;
    exact(p, ['status', 'digest', 'repository', 'baseSha', 'bSha', 'targetBranch', 'pullRequestNumber', 'tagTargetSha',
      'tagObjectOid', 'ownerDecisionId', 'authoritySetDigest', 'authorityIds'], 'G0 procedure');
    if (!isVerified(p)) { eligibilityUnavailable = true; throw new Error('G0 procedure is not validated.'); }
    digest(p.digest, 'G0 procedure digest');
    binding(p.repository, c.repository, 'Procedure repository');
    binding(p.baseSha, c.baseSha, 'Procedure base');
    binding(p.bSha, c.bSha, 'Procedure B');
    binding(p.targetBranch, c.targetBranch, 'Procedure target');
    binding(p.pullRequestNumber, c.pullRequest.number, 'Procedure PR');
    binding(p.tagTargetSha, c.bSha, 'G0 tag target');
    commit(p.tagObjectOid, 'G0 annotated tag object');
    digest(p.authoritySetDigest, 'Procedure Authority Set digest');
    if (!Array.isArray(p.authorityIds) || !p.authorityIds.length || new Set(p.authorityIds).size !== p.authorityIds.length) {
      throw new Error('Procedure does not bind the complete Authority Set.');
    }
    if (typeof p.ownerDecisionId !== 'string' || !p.ownerDecisionId) throw new Error('Procedure ownerDecisionId is missing.');

    const o = input.ordinaryDecision;
    exact(o, ['status', 'decision', 'ownerDecisionId', 'repository', 'baseSha', 'bSha', 'authoritySetDigest', 'authorityIds'], 'ordinary owner decision');
    if (!isVerified(o)) { eligibilityUnavailable = true; throw new Error('Ordinary result is not validated.'); }
    if (o.decision !== 'OWNER_DECISION') throw new Error('Ordinary result is not an OWNER_DECISION.');
    for (const key of ['repository', 'baseSha', 'bSha']) binding(o[key], c[key], `Ordinary decision ${key}`);
    binding(o.ownerDecisionId, p.ownerDecisionId, 'Ordinary ownerDecisionId');
    binding(o.authoritySetDigest, p.authoritySetDigest, 'Ordinary Authority Set');
    if (!Array.isArray(o.authorityIds) || o.authorityIds.length !== p.authorityIds.length ||
        o.authorityIds.some((id, index) => id !== p.authorityIds[index])) throw new Error('Ordinary result does not report the complete selected Authority Set.');

    const a = input.authoritySet;
    exact(a, ['status', 'ids', 'digest'], 'complete Authority Set');
    if (!isVerified(a)) { eligibilityUnavailable = true; throw new Error('Complete selected Authority Set is not validated.'); }
    if (!Array.isArray(a.ids) || a.ids.length < 1 || a.ids.some(id => typeof id !== 'string' || !id) ||
        new Set(a.ids).size !== a.ids.length) throw new Error('Complete selected Authority Set is not validated.');
    digest(a.digest, 'Authority Set digest');
    binding(a.digest, p.authoritySetDigest, 'Procedure Authority Set');
    if (a.ids.length !== p.authorityIds.length || a.ids.some((id, index) => id !== p.authorityIds[index])) {
      throw new Error('Procedure does not identify the complete selected Authority Set.');
    }

    const e = input.eligibility;
    exact(e, ['status', 'digest', 'result', 'repository', 'baseSha', 'bSha', 'pullRequestNumber', 'authoritySetDigest', 'authorityIds'], 'B eligibility');
    if (!isVerified(e)) { eligibilityUnavailable = true; throw new Error('B eligibility is not validated.'); }
    digest(e.digest, 'B eligibility result digest');
    for (const [key, expected] of Object.entries({ repository: c.repository, baseSha: c.baseSha, bSha: c.bSha,
      pullRequestNumber: c.pullRequest.number, authoritySetDigest: a.digest })) binding(e[key], expected, `Eligibility ${key}`);
    if (!Array.isArray(e.authorityIds) || e.authorityIds.length !== a.ids.length ||
        e.authorityIds.some((id, index) => id !== a.ids[index])) throw new Error('Eligibility does not report the complete selected Authority Set.');
    if (!['eligible', 'ineligible'].includes(e.result)) throw new Error('Eligibility result is invalid.');
    eligibility = e.result;
  } catch (error) { eligibilityError = error.message; }

  let mergeValid = false;
  let mergedAt;
  let mergeSha;
  let mergeError;
  if (input.merge !== null) {
    try {
      const m = input.merge;
      exact(m, ['hostMetadata', 'commit'], 'merge evidence');
      const h = m.hostMetadata;
      exact(h, ['status', 'repository', 'targetBranch', 'pullRequestNumber', 'headSha', 'baseSha', 'state', 'mergeSha', 'mergedAt'], 'trusted PR metadata');
      if (!isVerified(h) || h.state !== 'merged') throw new Error('Trusted host metadata does not verify a merged PR.');
      binding(h.repository, c.repository, 'Merged PR repository'); binding(h.targetBranch, c.targetBranch, 'Merged PR target');
      binding(h.pullRequestNumber, c.pullRequest.number, 'Merged PR number');
      binding(h.headSha, c.bSha, 'Merged PR head'); binding(h.baseSha, c.baseSha, 'Merged PR base');
      commit(h.mergeSha, 'Host merge commit'); mergedAt = date(h.mergedAt, 'Merge time'); mergeSha = h.mergeSha;
      const mc = m.commit;
      exact(mc, ['sha', 'parents', 'tree'], 'merge commit');
      commit(mc.sha, 'Merge commit'); commit(mc.tree, 'Merge tree');
      if (!Array.isArray(mc.parents) || mc.parents.length !== 2) throw new Error('Only a two-parent merge commit is supported.');
      mc.parents.forEach((parent, index) => commit(parent, `Merge parent ${index + 1}`));
      binding(mc.sha, h.mergeSha, 'Host and Git merge commit');
      binding(mc.parents[0], c.baseSha, 'First merge parent'); binding(mc.parents[1], c.bSha, 'Second merge parent');
      binding(mc.tree, c.bTree, 'Merge tree');
      mergeValid = true;
    } catch (error) { mergeError = error.message; }
  }

  let evidenceValid = false;
  let evidenceError;
  let evidenceIncomplete = false;
  let producer;
  let eligibilityCompletedAt;
  if (input.eligibilityEvidence !== null) {
    try {
      const ev = input.eligibilityEvidence;
      exact(ev, ['status', 'provenance', 'completedAt'], 'eligibility evidence');
      if (!isVerified(ev)) {
        evidenceIncomplete = true;
        evidenceError = 'Eligibility provenance is not verified by the adapter.';
        throw new Error(evidenceError);
      }
      const provenance = ev.provenance;
      exact(provenance, ['status', 'selection', 'workflow', 'repository', 'targetBranch', 'pullRequestNumber',
        'baseSha', 'bSha', 'authoritySetDigest', 'procedureDigest', 'eligibilityDigest', 'completedAt'], 'eligibility provenance');
      const workflow = provenance.workflow;
      exact(workflow, ['runId', 'attempt', 'jobId', 'workflowPath', 'callerPath'], 'selected workflow provenance');
      if (!isVerified(provenance)) {
        evidenceIncomplete = true;
        throw new Error('Eligibility producer provenance is not verified by the adapter.');
      }
      if (provenance.selection !== 'recorded-base-policy' ||
          !/^\d+$/.test(String(workflow.runId)) || !Number.isSafeInteger(workflow.attempt) || workflow.attempt < 1 ||
          (typeof workflow.jobId !== 'string' && !Number.isSafeInteger(workflow.jobId)) || !String(workflow.jobId).trim() ||
          typeof workflow.workflowPath !== 'string' || !workflow.workflowPath.trim() ||
          typeof workflow.callerPath !== 'string' || !workflow.callerPath.trim()) {
        throw new Error('Eligibility producer provenance is not verified from the recorded-base policy.');
      }
      for (const [key, expected] of Object.entries({ repository: c.repository, targetBranch: c.targetBranch,
        pullRequestNumber: c.pullRequest.number, baseSha: c.baseSha, bSha: c.bSha })) binding(provenance[key], expected, `Eligibility provenance ${key}`);
      digest(provenance.authoritySetDigest, 'Eligibility provenance Authority Set digest');
      if (input.authoritySet?.digest) binding(provenance.authoritySetDigest, input.authoritySet.digest, 'Eligibility provenance Authority Set');
      digest(provenance.procedureDigest, 'Eligibility provenance procedure digest');
      digest(provenance.eligibilityDigest, 'Eligibility provenance result digest');
      binding(provenance.procedureDigest, input.procedure.digest, 'Eligibility provenance procedure');
      binding(provenance.eligibilityDigest, input.eligibility.digest, 'Eligibility provenance result');
      producer = { runId: String(workflow.runId), attempt: workflow.attempt, jobId: String(workflow.jobId),
        workflowPath: workflow.workflowPath, callerPath: workflow.callerPath };
      eligibilityCompletedAt = date(ev.completedAt, 'Eligibility completion time');
      if (ev.completedAt !== provenance.completedAt) throw new Error('Eligibility completion time differs from verified producer provenance.');
      if (mergedAt !== undefined && eligibilityCompletedAt >= mergedAt) throw new Error('Eligibility evidence was completed at or after merge.');
      evidenceValid = true;
    } catch (error) { evidenceError ??= error.message; }
  } else {
    evidenceIncomplete = true;
    evidenceError = 'Pre-merge eligibility provenance is missing.';
  }

  let canonical = 'pending';
  let readbackError;
  if (input.targetReadback !== null) {
    try {
      const r = input.targetReadback;
      exact(r, ['status', 'repository', 'targetRef', 'targetSha', 'ancestorShas', 'authorityDigest'], 'target readback');
      if (!isVerified(r)) throw new Error('Target readback is not verified.');
      binding(r.repository, c.repository, 'Readback repository'); binding(r.targetRef, `refs/heads/${c.targetBranch}`, 'Readback target ref');
      commit(r.targetSha, 'Readback target commit'); digest(r.authorityDigest, 'Readback authority digest');
      if (!Array.isArray(r.ancestorShas)) throw new Error('Readback ancestry is missing.');
      r.ancestorShas.forEach((sha, index) => commit(sha, `Readback ancestor ${index + 1}`));
      if (!mergeValid || !mergeSha) throw new Error('Readback cannot be bound without a verified exact-B merge commit.');
      if (!r.ancestorShas.includes(mergeSha) && r.targetSha !== mergeSha) throw new Error('Readback target does not contain the PR merge commit.');
      binding(r.authorityDigest, c.authorityDigest, 'Canonical authority state');
      canonical = 'verified';
    } catch (error) { readbackError = error.message; canonical = 'invalid'; }
  }

  let adoption = 'pending';
  let adoptionError;
  if (eligibility === 'ineligible') { adoption = 'invalid'; adoptionError = 'Exact B was found ineligible.'; }
  else if (input.merge !== null || input.targetReadback !== null) {
    if (eligibility !== 'eligible') {
      adoption = eligibilityUnavailable ? 'incomplete' : 'invalid';
      adoptionError = eligibilityError ?? 'Exact-B eligibility is incomplete.';
    }
    else if (!mergeValid) { adoption = 'invalid'; adoptionError = mergeError ?? 'Merge evidence is invalid.'; }
    else if (!evidenceValid && evidenceIncomplete) { adoption = 'incomplete'; adoptionError = evidenceError ?? 'Pre-merge eligibility provenance is incomplete.'; }
    else if (!evidenceValid) { adoption = 'invalid'; adoptionError = evidenceError ?? 'Pre-merge eligibility provenance is invalid.'; }
    else if (canonical === 'invalid') { adoption = 'invalid'; adoptionError = readbackError ?? 'Canonical target readback is invalid.'; }
    else if (canonical !== 'verified') { adoption = 'pending'; adoptionError = 'Canonical target readback is pending.'; }
    else { adoption = 'valid'; }
  }

  return {
    version: 1,
    eligibility,
    adoption,
    canonical,
    principalAuthentication: 'not_verified',
    hostEnforcement: 'not_verified',
    ...(eligibilityError ? { eligibilityError } : {}),
    ...(evidenceValid ? { eligibilityProducer: producer, eligibilityCompletedAt: new Date(eligibilityCompletedAt).toISOString() } : {}),
    ...(adoptionError ? { adoptionError } : {}),
    ...(readbackError ? { canonicalError: readbackError } : {}),
  };
}
