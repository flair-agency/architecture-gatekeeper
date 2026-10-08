import {
  inspectOwnerAmendmentAttestation,
  verifyOwnerAmendmentBlockEvidence,
} from '../../../src/owner-amendment-attestation.mjs';

const expected = {
  repository: 'flair-agency/architecture-gatekeeper',
  workflowPath: '.github/workflows/owner-amendment.yml',
  workflowSha: 'a'.repeat(40), workflowRef: 'refs/heads/main', runId: '123', runAttempt: '1',
} as const;
const recordBytes = Buffer.from('{}');
const unknownOutput: unknown = JSON.parse('{}');
const result = inspectOwnerAmendmentAttestation({ recordBytes, verified: unknownOutput, expected });
if (result.status === 'VERIFIED_PRODUCER_ATTESTATION') {
  const digest: string = result.recordSha256;
  void digest;
} else {
  const reason: unknown = result.reason;
  const absentDigest: undefined = result.recordSha256;
  void [reason, absentDigest];
}

const incomplete = verifyOwnerAmendmentBlockEvidence({
  recordBytes, bundleBytes: Buffer.from('{}'), expected,
  runGh: (_file, _args, _options): unknown => 'not JSON',
});
void incomplete;

verifyOwnerAmendmentBlockEvidence({ recordBytes, bundleBytes: Buffer.from('{}'), expected,
  runGh: async (_file, _args, options) => { const encoding: 'utf8' = options.encoding; return encoding; } });
