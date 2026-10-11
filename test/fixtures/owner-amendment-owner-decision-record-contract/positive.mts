import {
  buildOwnerAmendmentOwnerDecisionRecord,
  validateOwnerAmendmentOwnerDecisionRecord,
} from '../../../src/owner-amendment-owner-decision-record.mjs';
import {
  buildOwnerAmendmentOwnerDecisionRecord as buildPhysical,
  validateOwnerAmendmentOwnerDecisionRecord as validatePhysical,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-record.mts';
import type {
  BuildOwnerAmendmentOwnerDecisionRecordInput,
  OwnerAmendmentOwnerDecisionRecord,
  ValidateOwnerAmendmentOwnerDecisionRecordInput,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-record.mts';

declare const external: unknown;
const input: BuildOwnerAmendmentOwnerDecisionRecordInput = {
  decisionBytes: external,
  schema: external,
  validation: external,
  authority: external,
  context: {
    repository: external, prNumber: external, baseSha: external, headSha: external, mergeSha: external,
    workflowSha: external, workflowPath: external, runId: external, runAttempt: external,
  },
  inputDigests: { manifest: external, policy: external, prompt: external, schema: external, validation: external },
};
const flatRecord: OwnerAmendmentOwnerDecisionRecord = buildOwnerAmendmentOwnerDecisionRecord(input);
const physicalRecord = buildPhysical(input);
const validationInput: ValidateOwnerAmendmentOwnerDecisionRecordInput = {
  ...input, record: flatRecord, recordBytes: external,
};
const rebuilt: OwnerAmendmentOwnerDecisionRecord = validateOwnerAmendmentOwnerDecisionRecord(validationInput);
const rebuiltPhysical = validatePhysical({ ...validationInput, record: physicalRecord });
const kind: 'owner-amendment-owner-decision-review-record' = rebuilt.kind;
const version: 1 = rebuilt.version;
const rawContextValue: unknown = rebuilt.repository;
const rawDecisionValue: unknown = rebuilt.decision;
const rawBase64Value: unknown = rebuilt.decisionBytesBase64;
rebuilt.workflowPath = external;
void [kind, version, rawContextValue, rawDecisionValue, rawBase64Value, rebuiltPhysical];
