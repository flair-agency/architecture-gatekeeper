import {
  buildOwnerAmendmentBlockRecord,
  validateOwnerAmendmentBlockRecord,
} from '../../../src/owner-amendment-block-record.mjs';
import {
  buildOwnerAmendmentBlockRecord as buildPhysical,
  validateOwnerAmendmentBlockRecord as validatePhysical,
} from '../../../src/owner-amendment/owner-amendment-block-record.mts';
import type {
  BuildOwnerAmendmentBlockRecordInput,
  OwnerAmendmentBlockRecord,
  ValidateOwnerAmendmentBlockRecordInput,
} from '../../../src/owner-amendment/owner-amendment-block-record.mts';

declare const external: unknown;
const input: BuildOwnerAmendmentBlockRecordInput = {
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
const flatRecord: OwnerAmendmentBlockRecord = buildOwnerAmendmentBlockRecord(input);
const physicalRecord = buildPhysical(input);
const validationInput: ValidateOwnerAmendmentBlockRecordInput = { ...input, record: flatRecord, recordBytes: external };
const rebuilt: OwnerAmendmentBlockRecord = validateOwnerAmendmentBlockRecord(validationInput);
const rebuiltPhysical = validatePhysical({ ...validationInput, record: physicalRecord });
const kind: unknown = rebuilt.kind;
const version: unknown = rebuilt.version;
// Context is spread after the initial literals, so accessors may replace them.
// the final kind may come from a reread spread property
const fixedKind: 'owner-amendment-block-review-record' = rebuilt.kind;
// the final version may come from a reread spread property
const fixedVersion: 1 = rebuilt.version;
const rawRepository: unknown = rebuilt.repository;
const rawDecision: unknown = rebuilt.decision;
const rawBase64: unknown = rebuilt.decisionBytesBase64;
const possiblyMissingMergeSha: unknown = rebuilt.mergeSha;
rebuilt.workflowPath = external;
void [kind, version, fixedKind, fixedVersion, rawRepository, rawDecision, rawBase64, possiblyMissingMergeSha, rebuiltPhysical];
