import {
  buildOwnerAmendmentBlockRecord,
  validateOwnerAmendmentBlockRecord,
} from '../../../src/owner-amendment-block-record.mjs';
import type {
  BuildOwnerAmendmentBlockRecordInput,
  OwnerAmendmentBlockRecord,
  ValidateOwnerAmendmentBlockRecordInput,
} from '../../../src/owner-amendment/owner-amendment-block-record.mts';

declare const input: BuildOwnerAmendmentBlockRecordInput;
declare const validationInput: ValidateOwnerAmendmentBlockRecordInput;
declare const record: OwnerAmendmentBlockRecord;
buildOwnerAmendmentBlockRecord({});
validateOwnerAmendmentBlockRecord({});
input.context.repository = 'example/repository';
const decisionString: string = record.decision;
const validatedRepository: string = validateOwnerAmendmentBlockRecord(validationInput).repository;
const base64String: string = record.decisionBytesBase64;
const fixedKind: 'owner-amendment-block-review-record' = record.kind;
const fixedVersion: 1 = record.version;
const mergeSha: string = record.mergeSha;
const workflowPath: string = record.workflowPath;
void [decisionString, validatedRepository, base64String, fixedKind, fixedVersion, mergeSha, workflowPath];
