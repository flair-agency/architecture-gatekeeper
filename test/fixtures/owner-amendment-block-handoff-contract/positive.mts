import { prepareOwnerAmendmentBlockHandoff } from '../../../src/owner-amendment-block-handoff.mjs';
import type { OwnerAmendmentBlockHandoffInput, PreparedOwnerAmendmentBlockHandoff } from '../../../src/owner-amendment/owner-amendment-block-handoff.mts';

type CoercibleB = { marker: 'coercible-B'; toString(): string };
declare const bSha: CoercibleB;
const provenanceResult = { status: 'VERIFIED_PRODUCER_ATTESTATION', recordSha256: 'a'.repeat(64), auditLabel: 'same caller object' };
const input: OwnerAmendmentBlockHandoffInput<CoercibleB, typeof provenanceResult> = {
  recordBytes: Buffer.from('{}'),
  bundleBytes: Buffer.from('{}'),
  amendmentRecordBytes: Buffer.from('{}'),
  expected: { repository: 'owner/repo', workflowSha: 'a'.repeat(40), workflowPath: '.github/workflows/review.yml', runId: '1', runAttempt: '1' },
  bSha,
  provenanceResult,
};
const prepared = prepareOwnerAmendmentBlockHandoff(input);
const resultContract: PreparedOwnerAmendmentBlockHandoff<CoercibleB, typeof provenanceResult> = prepared;
const sameB: CoercibleB = prepared.bSha;
const sameEnvelopeB: CoercibleB = prepared.envelope.bSha;
const auditLabel: string = prepared.provenance.auditLabel;
const tagText: string = prepared.tagMessage;
const reviewDigest: string = prepared.reviewRecordSha256;
const amendmentDigest: string = prepared.envelope.amendmentRecordSha256;
const reviewRecordBase64: unknown = prepared.envelope.reviewRecordBase64;
prepared.envelope.reviewRecordBase64 = 'mutable envelope field';
void [resultContract, sameB, sameEnvelopeB, auditLabel, tagText, reviewDigest, amendmentDigest, reviewRecordBase64];
