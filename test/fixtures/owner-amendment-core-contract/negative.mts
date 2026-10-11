import { parseOwnerAmendmentBlockRecord, validateOwnerAmendmentG0TagEnvelope,
  validateOwnerAmendmentG0Procedure } from '../../../src/owner-amendment.mjs';
import type { ValidateOwnerAmendmentG0ProcedureInput, ValidateOwnerAmendmentG0TagEnvelopeInput } from '../../../src/owner-amendment/owner-amendment.mts';

// @ts-expect-error The canonical parser requires the byte observation argument.
parseOwnerAmendmentBlockRecord();
// @ts-expect-error The tag-envelope validator requires its complete named input.
validateOwnerAmendmentG0TagEnvelope();
// @ts-expect-error The procedure validator requires its complete named input.
validateOwnerAmendmentG0Procedure();
// @ts-expect-error An empty object is not the required tag-envelope input.
validateOwnerAmendmentG0TagEnvelope({});
// @ts-expect-error An empty object is not the required procedure input.
validateOwnerAmendmentG0Procedure({});
declare const envelopeInput: ValidateOwnerAmendmentG0TagEnvelopeInput;
declare const procedureInput: ValidateOwnerAmendmentG0ProcedureInput;
const { tagRef: _tagRef, ...missingTagRef } = envelopeInput;
// @ts-expect-error Each required external tag observation remains present as unknown.
validateOwnerAmendmentG0TagEnvelope(missingTagRef);
const { policy: _policy, ...missingPolicy } = procedureInput;
// @ts-expect-error The policy observation is a required procedure input.
validateOwnerAmendmentG0Procedure(missingPolicy);

const parsed = parseOwnerAmendmentBlockRecord(Buffer.alloc(0));
// @ts-expect-error The parsed output is a mutable validated record, not readonly values that may be reassigned.
parsed.purpose = 42;
const envelope = validateOwnerAmendmentG0TagEnvelope(envelopeInput);
// @ts-expect-error Caller-sourced tag observations remain unknown in the frozen result.
const tagObjectOid: string = envelope.tagObjectOid;
// @ts-expect-error The frozen envelope result cannot be mutated.
envelope.profile = 'changed';
const procedure = validateOwnerAmendmentG0Procedure(procedureInput);
// @ts-expect-error Caller-sourced current-state observations remain unknown in the frozen result.
const repository: string = procedure.repository;
// @ts-expect-error The frozen procedure result cannot be mutated.
procedure.grade = 'G1';
void [tagObjectOid, repository];
