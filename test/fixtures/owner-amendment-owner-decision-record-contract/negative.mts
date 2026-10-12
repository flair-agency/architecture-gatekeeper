import {
  buildOwnerAmendmentOwnerDecisionRecord,
  validateOwnerAmendmentOwnerDecisionRecord,
} from '../../../src/owner-amendment-owner-decision-record.mjs';
import type {
  BuildOwnerAmendmentOwnerDecisionRecordInput,
  OwnerAmendmentOwnerDecisionRecord,
  ValidateOwnerAmendmentOwnerDecisionRecordInput,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-record.mts';

declare const input: BuildOwnerAmendmentOwnerDecisionRecordInput;
declare const validationInput: ValidateOwnerAmendmentOwnerDecisionRecordInput;
declare const record: OwnerAmendmentOwnerDecisionRecord;
buildOwnerAmendmentOwnerDecisionRecord({});
validateOwnerAmendmentOwnerDecisionRecord({});
buildOwnerAmendmentOwnerDecisionRecord({ ...input, context: {} });
validateOwnerAmendmentOwnerDecisionRecord({ ...validationInput, context: {} });
const { runAttempt: omittedRunAttempt, ...contextWithoutRunAttempt } = input.context;
buildOwnerAmendmentOwnerDecisionRecord({ ...input, context: contextWithoutRunAttempt });
validateOwnerAmendmentOwnerDecisionRecord({ ...validationInput, context: contextWithoutRunAttempt });
const { authority: omittedAuthority, ...inputWithoutAuthority } = input;
buildOwnerAmendmentOwnerDecisionRecord(inputWithoutAuthority);
input.context.repository = 'example/repository';
const decisionString: string = record.decision;
const validatedRepository: string = validateOwnerAmendmentOwnerDecisionRecord(validationInput).repository;
const base64String: string = record.decisionBytesBase64;
const kindLiteral: 'owner-amendment-owner-decision-review-record' = record.kind;
const versionLiteral: 1 = record.version;
const digestString: string = record.decisionSha256;
void [omittedRunAttempt, omittedAuthority, decisionString, validatedRepository, base64String, kindLiteral, versionLiteral, digestString];
