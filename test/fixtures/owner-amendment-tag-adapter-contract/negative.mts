import { createAndReadOwnerAmendmentTag } from '../../../src/owner-amendment-tag-adapter.mjs';
import type { CreateAndReadOwnerAmendmentTagResult, OwnerAmendmentTagFetch, OwnerAmendmentTagResponse } from '../../../src/owner-amendment-tag-adapter.mjs';
import { classifyOwnerAmendmentTagAttempt as classifyAttempt } from '../../../src/owner-amendment-tag-attempt.mjs';
import { classifyOwnerAmendmentTagAttempt as classifyDirect } from '../../../src/owner-amendment/owner-amendment-tag-attempt.mts';
import type { OwnerAmendmentTagAttemptInput } from '../../../src/owner-amendment/owner-amendment-tag-attempt.mts';

declare const partial: { tagRef: string; bSha: string; tagMessage: string; tagNamespace: string; rulesetId: number; token: string; tagger: { name: string; email: string; date: string } };
const missingRepository = createAndReadOwnerAmendmentTag(partial);
const missingB = createAndReadOwnerAmendmentTag({ repository: 'owner/repo', ...partial, bSha: undefined });
const missingTagger = createAndReadOwnerAmendmentTag({ repository: 'owner/repo', ...partial, tagger: undefined });
classifyAttempt();
classifyDirect();
classifyAttempt({});
classifyDirect({});
declare const observed: unknown;
const completeAttempt: OwnerAmendmentTagAttemptInput = {
  repository: observed, baseSha: observed, bSha: observed, baseBranch: observed, triggerProfile: observed,
  policyBytes: observed, readTagRef: () => observed,
};
const { repository: _repository, ...missingAttemptRepository } = completeAttempt;
const { baseSha: _baseSha, ...missingBaseSha } = completeAttempt;
const { bSha: _bSha, ...missingBSha } = completeAttempt;
const { baseBranch: _baseBranch, ...missingBaseBranch } = completeAttempt;
const { triggerProfile: _triggerProfile, ...missingTriggerProfile } = completeAttempt;
const { policyBytes: _policyBytes, ...missingPolicyBytes } = completeAttempt;
const { readTagRef: _readTagRef, ...missingReadTagRef } = completeAttempt;
classifyAttempt(missingAttemptRepository);
classifyAttempt(missingBaseSha);
classifyAttempt(missingBSha);
classifyAttempt(missingBaseBranch);
classifyAttempt(missingTriggerProfile);
classifyAttempt(missingPolicyBytes);
classifyAttempt(missingReadTagRef);
classifyDirect(missingAttemptRepository);
classifyDirect(missingBaseSha);
classifyDirect(missingBSha);
classifyDirect(missingBaseBranch);
classifyDirect(missingTriggerProfile);
classifyDirect(missingPolicyBytes);
classifyDirect(missingReadTagRef);
const wrongCallback: OwnerAmendmentTagFetch = (_url: string) => 'response';
const wrongJson: OwnerAmendmentTagResponse = { ok: true, status: 200, json: 'not callable' };
declare const result: CreateAndReadOwnerAmendmentTagResult;
result.transportStatus = 'CREATED_AND_READ_BACK';
const expectedSha: string = result.refReadback.object.sha;
const authenticated: { authenticated: true } = result.tagReadback;
void [missingRepository, missingB, missingTagger, wrongCallback, wrongJson, expectedSha, authenticated,
  missingAttemptRepository, missingBaseSha, missingBSha, missingBaseBranch, missingTriggerProfile, missingPolicyBytes, missingReadTagRef];
