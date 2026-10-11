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
input.context.repository = 'example/repository';
const decisionString: string = record.decision;
const validatedRepository: string = validateOwnerAmendmentOwnerDecisionRecord(validationInput).repository;
const base64String: string = record.decisionBytesBase64;
const kindLiteral: 'owner-amendment-owner-decision-review-record' = record.kind;
const versionLiteral: 1 = record.version;
void [decisionString, validatedRepository, base64String, kindLiteral, versionLiteral];
