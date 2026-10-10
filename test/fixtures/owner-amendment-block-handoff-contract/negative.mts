import { prepareOwnerAmendmentBlockHandoff } from '../../../src/owner-amendment-block-handoff.mjs';

const result = prepareOwnerAmendmentBlockHandoff({
  recordBytes: Buffer.from('{}'), bundleBytes: Buffer.from('{}'), amendmentRecordBytes: Buffer.from('{}'),
  expected: { repository: 'owner/repo', workflowSha: 'a'.repeat(40), workflowPath: '.github/workflows/review.yml', runId: '1', runAttempt: '1' },
  bSha: { marker: 'coercible-B', toString: () => 'b'.repeat(40) },
  provenanceResult: { status: 'VERIFIED_PRODUCER_ATTESTATION', recordSha256: 'a'.repeat(64) },
});
const tagText: number = result.tagMessage;
const reviewDigest: number = result.reviewRecordSha256;
const provenanceMissingField: string = result.provenance.missingField;
const base64Text: string = result.envelope.reviewRecordBase64;
result.status = 'changed';
result.envelope = {};
prepareOwnerAmendmentBlockHandoff({
  recordBytes: Buffer.from('{}'), bundleBytes: Buffer.from('{}'), amendmentRecordBytes: Buffer.from('{}'),
  expected: { repository: 'owner/repo' }, bSha: 'b'.repeat(40), provenanceResult: {},
});
void [tagText, reviewDigest, provenanceMissingField, base64Text];
