import { assertOwnerAmendmentTagAbsentAtAcceptance, classifyOwnerAmendmentTagAttempt, type OwnerAmendmentTagAttemptInput } from '../../../../src/owner-amendment/owner-amendment-tag-attempt.mjs';
import { parseOwnerAmendmentSemanticTagObject } from '../../../../src/owner-amendment/owner-amendment-semantic-tag-object.mjs';

const response = { status: 404, requestedUrl: 'https://api.github.com/unknown' };
const syncInput: OwnerAmendmentTagAttemptInput = { readTagRef: () => response };
const asyncInput: OwnerAmendmentTagAttemptInput = { readTagRef: async () => response };
function thenable<T>(value: T): PromiseLike<T> { return Promise.resolve(value); }
const thenableInput: OwnerAmendmentTagAttemptInput = { readTagRef: () => thenable(response) };
const scalarInput: OwnerAmendmentTagAttemptInput = { readTagRef: () => 404 };
void [syncInput, asyncInput, thenableInput, scalarInput];
void classifyOwnerAmendmentTagAttempt(syncInput);
void assertOwnerAmendmentTagAbsentAtAcceptance(syncInput);
const externalBytes: unknown = new Uint8Array();
void parseOwnerAmendmentSemanticTagObject(externalBytes, { bSha: 'b'.repeat(40), triggerProfile: 'completed-block-v1', tagRef: 'unknown' });
void parseOwnerAmendmentSemanticTagObject('unchecked external bytes', { bSha: {}, triggerProfile: 17, tagRef: false });

const attempt = await classifyOwnerAmendmentTagAttempt(syncInput);
if (attempt.attempted) { const presentRef: string = attempt.tagRef; void presentRef; }
else { const absentRef: null = attempt.tagRef; void absentRef; }
const absent = await assertOwnerAmendmentTagAbsentAtAcceptance(syncInput);
const noTag: null = absent.tagRef;
void noTag;
