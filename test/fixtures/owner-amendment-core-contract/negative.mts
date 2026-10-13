import { parseOwnerAmendmentBlockRecord, validateOwnerAmendmentG0TagEnvelope,
  validateOwnerAmendmentG0Procedure } from '../../../src/owner-amendment.mjs';
import type { ValidateOwnerAmendmentG0ProcedureInput, ValidateOwnerAmendmentG0TagEnvelopeInput } from '../../../src/owner-amendment/owner-amendment.mts';

// The canonical parser requires the byte observation argument.
parseOwnerAmendmentBlockRecord();
// The tag-envelope validator requires its complete named input.
validateOwnerAmendmentG0TagEnvelope();
// The procedure validator requires its complete named input.
validateOwnerAmendmentG0Procedure();
// An empty object is not the required tag-envelope input.
validateOwnerAmendmentG0TagEnvelope({});
// An empty object is not the required procedure input.
validateOwnerAmendmentG0Procedure({});
declare const envelopeInput: ValidateOwnerAmendmentG0TagEnvelopeInput;
declare const procedureInput: ValidateOwnerAmendmentG0ProcedureInput;
const { tagRef: _tagRef, ...missingTagRef } = envelopeInput;
// Each required external tag observation remains present as unknown.
validateOwnerAmendmentG0TagEnvelope(missingTagRef);
const { policy: _policy, ...missingPolicy } = procedureInput;
// The policy observation is a required procedure input.
validateOwnerAmendmentG0Procedure(missingPolicy);

const parsed = parseOwnerAmendmentBlockRecord(Buffer.alloc(0));
// Parsed v2 authority previous digest is a validated string.
const previousDigestNumber: number = parsed.authority.previousSha256;
// Parsed v2 authority new digest is a validated string.
const newDigestNumber: number = parsed.authority.newSha256;
// The v2 parsed authority does not claim an unrelated standalone digest.
const unrelatedDigest: string = parsed.authority.sha256;
// The parsed output is a mutable validated record, not readonly values that may be reassigned.
parsed.purpose = 42;
const envelope = validateOwnerAmendmentG0TagEnvelope(envelopeInput);
// Validated envelope digest fields are strings, not numbers.
const envelopeDigestNumber: number = envelope.reviewRecordSha256;
// Validated envelope digest fields are strings, not numbers.
const amendmentDigestNumber: number = envelope.amendmentRecordSha256;
// Validated envelope digest fields are strings, not numbers.
const attestationDigestNumber: number = envelope.attestationBundleSha256;
// Caller-sourced tag observations remain unknown in the frozen result.
const tagObjectOid: string = envelope.tagObjectOid;
// The frozen envelope result cannot be mutated.
envelope.profile = 'changed';
const procedure = validateOwnerAmendmentG0Procedure(procedureInput);
// Caller-sourced current-state observations remain unknown in the frozen result.
const repository: string = procedure.repository;
// The frozen procedure result cannot be mutated.
procedure.grade = 'G1';
void [previousDigestNumber, newDigestNumber, unrelatedDigest, envelopeDigestNumber, amendmentDigestNumber, attestationDigestNumber, tagObjectOid, repository];
