import { assertOwnerAmendmentTagAbsentAtAcceptance, classifyOwnerAmendmentTagAttempt, type OwnerAmendmentTagAttempt, type OwnerAmendmentTagAttemptInput } from '../../../../src/owner-amendment/owner-amendment-tag-attempt.mjs';
import { parseOwnerAmendmentSemanticTagObject } from '../../../../src/owner-amendment/owner-amendment-semantic-tag-object.mjs';

const badCallback: OwnerAmendmentTagAttemptInput = { readTagRef: 123 };
const badReader: OwnerAmendmentTagAttemptInput = { readTagRef: (request: { expectedUrl: number }) => ({ status: request.expectedUrl }) };
const input: OwnerAmendmentTagAttemptInput = {};
const result = await assertOwnerAmendmentTagAbsentAtAcceptance(input);
result.status = 'OWNER_AMENDMENT_ATTEMPT';
const unrefined = await classifyOwnerAmendmentTagAttempt(input);
const nonNullableTagRef: string = unrefined.tagRef;
const parsed = parseOwnerAmendmentSemanticTagObject;
declare const tagBytes: unknown;
const unchecked = parsed(tagBytes, {});
const trustedEnvelopeField: string = unchecked.envelope.reviewRecordBase64;
const inconsistent = { status: 'OWNER_AMENDMENT_NOT_APPLICABLE' as const, attempted: false as const, tagRef: 'present' };
const impossibleAttempt: OwnerAmendmentTagAttempt = inconsistent;
