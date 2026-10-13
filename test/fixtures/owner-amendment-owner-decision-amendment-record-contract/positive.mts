import {
  buildOwnerAmendmentOwnerDecisionAmendmentRecord,
  validateOwnerAmendmentOwnerDecisionAmendmentRecord,
  type OwnerAmendmentOwnerDecisionAmendmentRecordInput,
  type OwnerAmendmentOwnerDecisionAmendmentRecordValidationInput,
} from '../../../src/owner-amendment/owner-amendment-owner-decision-amendment-record.mts';

declare const input: OwnerAmendmentOwnerDecisionAmendmentRecordInput;
const built = buildOwnerAmendmentOwnerDecisionAmendmentRecord(input);
const amendmentBytes: Buffer = built.bytes;
const recordKind: 'owner-amendment-owner-decision-amendment-record' = built.record.kind;
const recordVersion: 2 = built.record.version;
const authorityId: string = built.record.authority.id;
const priorDigest: string = built.record.priorAuthoritySetDigest;
const rereadChangePath: unknown = built.record.changes[0].path;
// The validator reads `path` again when it constructs the returned change.
// That accessor result is not protected by the earlier checks.
// the final path read is not guaranteed to be a string
const guaranteedChangePath: string = built.record.changes[0].path;
const coercedBaseSha: unknown = built.record.baseSha;
// SHA fields intentionally retain unknown because the original builder tests
// them with RegExp.test coercion and stores the input value in the record.
// successful construction does not normalize the original SHA input
const normalizedBaseSha: string = built.record.baseSha;
// record metadata is read-only
built.record.authority.id = 'changed';

declare const validationInput: OwnerAmendmentOwnerDecisionAmendmentRecordValidationInput;
const result = validateOwnerAmendmentOwnerDecisionAmendmentRecord(validationInput);
if (result.status === 'VERIFIED_OWNER_AMENDMENT_RECORD') {
  const status: 'VERIFIED_OWNER_AMENDMENT_RECORD' = result.status;
  const verifiedPurpose: string = result.purpose;
  const observedRepository: unknown = result.repository;
  const observedSha: unknown = result.baseSha;
  const readOnlyChanges: readonly Readonly<Record<string, unknown>>[] = result.changes;
  const targetWasValidated: true = result.targetValidated;
  void [status, verifiedPurpose, observedRepository, observedSha, readOnlyChanges, targetWasValidated];
} else {
  const externalReason: unknown = result.reason;
  void externalReason;
}
void [amendmentBytes, recordKind, recordVersion, authorityId, priorDigest, rereadChangePath, guaranteedChangePath, coercedBaseSha, normalizedBaseSha];
