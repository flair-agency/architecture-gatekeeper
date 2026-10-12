import {
  buildOwnerAmendmentOwnerDecisionAmendmentRecord,
  validateOwnerAmendmentOwnerDecisionAmendmentRecord,
  type OwnerAmendmentOwnerDecisionAmendmentRecordInput,
  type OwnerAmendmentOwnerDecisionAmendmentRecordValidationInput,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-amendment-record.mts';

declare const input: OwnerAmendmentOwnerDecisionAmendmentRecordInput;
const built = buildOwnerAmendmentOwnerDecisionAmendmentRecord(input);
built.record.version = 1;
const sha: string = built.record.baseSha;
void sha;
const guaranteedChangePath: string = built.record.changes[0].path;
void guaranteedChangePath;

declare const validationInput: OwnerAmendmentOwnerDecisionAmendmentRecordValidationInput;
const result = validateOwnerAmendmentOwnerDecisionAmendmentRecord(validationInput);
if (result.status === 'VERIFIED_OWNER_AMENDMENT_RECORD') {
  const reason: string = result.reason;
  void reason;
} else {
  const repository: string = result.repository;
  void repository;
}
