// Pure inspection of a cryptographically verified GitHub artifact attestation.
// This binds producer provenance to exact ReviewRecord bytes; it is not acceptance.
import { createHash } from 'node:crypto';

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DECODER = new TextDecoder('utf-8', { fatal: true });
const MAX_RECORD_BYTES = 1024 * 1024;
const EXPECTED_FIELDS = ['repository', 'workflowPath', 'workflowSha', 'workflowRef', 'runId', 'runAttempt'];

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
function fail(reason) { throw new Error(reason); }
function same(actual, expected, label) {
  if (actual !== expected) fail(`${label} differs from trusted expectation.`);
}

function validateExpected(expected) {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected).sort().join(',') !== [...EXPECTED_FIELDS].sort().join(',')) {
    fail('Trusted expected producer identity is incomplete or has unknown fields.');
  }
  if (!REPOSITORY.test(expected.repository) || !SHA.test(expected.workflowSha) ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test(expected.workflowPath) ||
      !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test(expected.workflowRef) ||
      ![expected.runId, expected.runAttempt].every(value =>
        typeof value === 'string' && /^[1-9]\d*$/.test(value))) {
    fail('Trusted expected producer identity has invalid values.');
  }
  return expected;
}

/**
 * Inspect the output of a successful `gh attestation verify --bundle --format json`.
 * `verified` must come directly from that verifier, not from an unverified JWS.
 * The caller remains responsible for obtaining `expected` through a trusted
 * protected-policy/host source and for all ReviewRecord semantics and acceptance.
 */
export function inspectOwnerAmendmentAttestation({ recordBytes, verified, expected }) {
  try {
    expected = validateExpected(expected);
    if (!Buffer.isBuffer(recordBytes) || recordBytes.length === 0 || recordBytes.length > MAX_RECORD_BYTES) {
      fail('Exact ReviewRecord bytes are absent or exceed the byte limit.');
    }
    // Confirm the supplied object has ordinary JSON bytes, without using any
    // author-supplied claims as provenance or deciding whether the record is valid.
    try { JSON.parse(DECODER.decode(recordBytes)); }
    catch { fail('ReviewRecord bytes are not valid UTF-8 JSON.'); }
    if (!Array.isArray(verified) || verified.length !== 1) {
      fail('Exactly one cryptographically verified attestation is required.');
    }

    const result = verified[0]?.verificationResult;
    const certificate = result?.signature?.certificate;
    const statement = result?.statement;
    if (!certificate || !statement) fail('Verified certificate or statement is absent.');

    const signer = `https://github.com/${expected.repository}/${expected.workflowPath}@${expected.workflowRef}`;
    same(certificate.subjectAlternativeName, signer, 'Certificate subject alternative name');
    same(certificate.buildSignerURI, signer, 'Build signer URI');
    same(certificate.buildConfigURI, signer, 'Build config URI');
    same(certificate.githubWorkflowRepository, expected.repository, 'Signer repository');
    same(certificate.githubWorkflowSHA, expected.workflowSha, 'Workflow revision');
    same(certificate.buildSignerDigest, expected.workflowSha, 'Signer digest');
    same(certificate.buildConfigDigest, expected.workflowSha, 'Workflow config digest');
    same(certificate.sourceRepositoryDigest, expected.workflowSha, 'Source revision');
    same(certificate.sourceRepositoryURI, `https://github.com/${expected.repository}`, 'Source repository');
    same(certificate.sourceRepositoryRef, expected.workflowRef, 'Source ref');
    same(certificate.githubWorkflowTrigger, 'pull_request_target', 'Workflow trigger');
    same(certificate.runInvocationURI,
      `https://github.com/${expected.repository}/actions/runs/${expected.runId}/attempts/${expected.runAttempt}`,
      'Workflow run and attempt');

    same(statement.predicateType, 'https://slsa.dev/provenance/v1', 'Attestation predicate type');
    const subjects = statement.subject;
    if (!Array.isArray(subjects) || subjects.length !== 1) fail('Exactly one attestation subject is required.');
    const subjectDigest = subjects[0]?.digest?.sha256;
    if (!SHA256.test(subjectDigest ?? '') || subjectDigest !== digest(recordBytes)) {
      fail('Attestation subject digest does not match the exact ReviewRecord bytes.');
    }
    if (typeof subjects[0]?.name !== 'string' || subjects[0].name.length === 0) {
      fail('Attestation subject name is absent.');
    }

    return Object.freeze({ status: 'VERIFIED_PRODUCER_ATTESTATION', recordSha256: digest(recordBytes) });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}
