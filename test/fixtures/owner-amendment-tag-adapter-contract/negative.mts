import { createAndReadOwnerAmendmentTag } from '../../../src/owner-amendment-tag-adapter.mjs';
import type { CreateAndReadOwnerAmendmentTagResult, OwnerAmendmentTagFetch, OwnerAmendmentTagResponse } from '../../../src/owner-amendment-tag-adapter.mjs';

declare const partial: { tagRef: string; bSha: string; tagMessage: string; tagNamespace: string; rulesetId: number; token: string; tagger: { name: string; email: string; date: string } };
const missingRepository = createAndReadOwnerAmendmentTag(partial);
const missingB = createAndReadOwnerAmendmentTag({ repository: 'owner/repo', ...partial, bSha: undefined });
const missingTagger = createAndReadOwnerAmendmentTag({ repository: 'owner/repo', ...partial, tagger: undefined });
const wrongCallback: OwnerAmendmentTagFetch = (_url: string) => 'response';
const wrongJson: OwnerAmendmentTagResponse = { ok: true, status: 200, json: 'not callable' };
declare const result: CreateAndReadOwnerAmendmentTagResult;
result.transportStatus = 'CREATED_AND_READ_BACK';
const expectedSha: string = result.refReadback.object.sha;
const authenticated: { authenticated: true } = result.tagReadback;
void [missingRepository, missingB, missingTagger, wrongCallback, wrongJson, expectedSha, authenticated];
