// Pure inspection of a cryptographically verified GitHub artifact attestation.
// This binds producer provenance to exact ReviewRecord bytes; it is not acceptance.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SHA = /^[a-f0-9]{40}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const DECODER = new TextDecoder('utf-8', { fatal: true });
const MAX_RECORD_BYTES = 1024 * 1024;
const EXPECTED_FIELDS = ['repository', 'workflowPath', 'workflowSha', 'workflowRef', 'runId', 'runAttempt'];
const MAX_BUNDLE_BYTES = 65_536;


// Erased property views preserve the original reads; they do not certify host
// data or stable accessor values. Regex/decoder/parser operation casts retain
// the existing coercion and failure behavior, rather than adding validation.
type ExpectedView = {
  repository: unknown; workflowPath: unknown; workflowSha: unknown;
  workflowRef: unknown; runId: unknown; runAttempt: unknown;
};
type CertificateView = Record<string, unknown>;
type SubjectView = { digest?: { sha256?: unknown }; name?: unknown };
type StatementView = { predicateType?: unknown; subject?: unknown };
type VerificationView = {
  signature?: { certificate?: CertificateView };
  statement?: StatementView;
};
export type OwnerAmendmentAttestationResult =
  | Readonly<{ status: 'VERIFIED_PRODUCER_ATTESTATION'; recordSha256: string }>
  | Readonly<{ status: 'INCOMPLETE'; reason: unknown; recordSha256?: never }>;
export type OwnerAmendmentGhOptions = Readonly<{
  encoding: 'utf8'; maxBuffer: number; timeout: number;
  stdio: readonly ['pipe', 'pipe', 'pipe'];
}>;
// Invocation is synchronous. The raw output is unknown: even a Promise is a
// possible malformed return value and is rejected by the existing JSON parser.
export type OwnerAmendmentGhRunner =
  (file: string, args: readonly unknown[], options: OwnerAmendmentGhOptions) => unknown;

const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function fail(reason: string): never { throw new Error(reason); }
function same(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) fail(`${label} differs from trusted expectation.`);
}

function validateExpected(expected: unknown): ExpectedView {
  if (!expected || typeof expected !== 'object' || Array.isArray(expected) ||
      Object.keys(expected).sort().join(',') !== [...EXPECTED_FIELDS].sort().join(',')) {
    fail('Trusted expected producer identity is incomplete or has unknown fields.');
  }
  if (!REPOSITORY.test((expected as ExpectedView).repository as string) || !SHA.test((expected as ExpectedView).workflowSha as string) ||
      !/^\.github\/workflows\/[A-Za-z0-9._-]+\.yml$/.test((expected as ExpectedView).workflowPath as string) ||
      !/^refs\/heads\/[A-Za-z0-9._/-]+$/.test((expected as ExpectedView).workflowRef as string) ||
      ![(expected as ExpectedView).runId, (expected as ExpectedView).runAttempt].every(value =>
        typeof value === 'string' && /^[1-9]\d*$/.test(value))) {
    fail('Trusted expected producer identity has invalid values.');
  }
  return expected as ExpectedView;
}

/**
 * Inspect the output of a successful `gh attestation verify --bundle --format json`.
 * `verified` must come directly from that verifier, not from an unverified JWS.
 * The caller remains responsible for obtaining `expected` through a trusted
 * protected-policy/host source and for all ReviewRecord semantics and acceptance.
 */
export function inspectOwnerAmendmentAttestation({ recordBytes, verified, expected }: {
  recordBytes: unknown; verified: unknown; expected: unknown;
}): OwnerAmendmentAttestationResult {
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

    const result = (verified as { verificationResult?: VerificationView }[])[0]?.verificationResult;
    const certificate = result?.signature?.certificate;
    const statement = result?.statement;
    if (!certificate || !statement) fail('Verified certificate or statement is absent.');

    // GitHub's certificate identifies the reusable workflow as the signer,
    // while buildConfigURI identifies the consumer workflow that called it.
    const signer = `https://github.com/${(expected as ExpectedView).repository}/.github/workflows/architecture-gate.yml@${(expected as ExpectedView).workflowRef}`;
    const caller = `https://github.com/${(expected as ExpectedView).repository}/${(expected as ExpectedView).workflowPath}@${(expected as ExpectedView).workflowRef}`;
    same(certificate.subjectAlternativeName, signer, 'Certificate subject alternative name');
    same(certificate.buildSignerURI, signer, 'Build signer URI');
    same(certificate.buildConfigURI, caller, 'Build config URI');
    same(certificate.githubWorkflowRepository, (expected as ExpectedView).repository, 'Signer repository');
    same(certificate.githubWorkflowSHA, (expected as ExpectedView).workflowSha, 'Workflow revision');
    same(certificate.buildSignerDigest, (expected as ExpectedView).workflowSha, 'Signer digest');
    same(certificate.buildConfigDigest, (expected as ExpectedView).workflowSha, 'Workflow config digest');
    same(certificate.sourceRepositoryDigest, (expected as ExpectedView).workflowSha, 'Source revision');
    same(certificate.sourceRepositoryURI, `https://github.com/${(expected as ExpectedView).repository}`, 'Source repository');
    same(certificate.sourceRepositoryRef, (expected as ExpectedView).workflowRef, 'Source ref');
    same(certificate.githubWorkflowTrigger, 'pull_request_target', 'Workflow trigger');
    same(certificate.runInvocationURI,
      `https://github.com/${(expected as ExpectedView).repository}/actions/runs/${(expected as ExpectedView).runId}/attempts/${(expected as ExpectedView).runAttempt}`,
      'Workflow run and attempt');

    same(statement.predicateType, 'https://slsa.dev/provenance/v1', 'Attestation predicate type');
    const subjects = statement.subject;
    if (!Array.isArray(subjects) || subjects.length !== 1) fail('Exactly one attestation subject is required.');
    const subjectDigest = (subjects as SubjectView[])[0]?.digest?.sha256;
    if (!SHA256.test((subjectDigest ?? '') as string) || subjectDigest !== digest(recordBytes)) {
      fail('Attestation subject digest does not match the exact ReviewRecord bytes.');
    }
    if (typeof (subjects as SubjectView[])[0]?.name !== 'string' || ((subjects as SubjectView[])[0].name as string).length === 0) {
      fail('Attestation subject name is absent.');
    }

    return Object.freeze({ status: 'VERIFIED_PRODUCER_ATTESTATION', recordSha256: digest(recordBytes) });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}

/** Run the GitHub CLI verifier against the supplied exact record and bundle bytes. */
export function verifyOwnerAmendmentBlockEvidence({ recordBytes, bundleBytes, expected, runGh = execFileSync as OwnerAmendmentGhRunner }: {
  recordBytes: unknown; bundleBytes: unknown; expected: unknown;
  runGh?: OwnerAmendmentGhRunner;
}): OwnerAmendmentAttestationResult {
  try {
    expected = validateExpected(expected);
    if (!Buffer.isBuffer(recordBytes) || !Buffer.isBuffer(bundleBytes)) fail('Evidence inputs must be exact byte buffers.');
    if (!recordBytes.length || recordBytes.length > MAX_RECORD_BYTES) fail('Exact ReviewRecord bytes are absent or exceed the byte limit.');
    if (!bundleBytes.length || bundleBytes.length > MAX_BUNDLE_BYTES) fail('Exact attestation bundle bytes are absent or exceed the byte limit.');
    // Verify private copies of the exact bytes returned to the caller. This
    // prevents a mutable download path changing between readback and gh.
    const temporary = mkdtempSync(join(tmpdir(), 'agk-block-verify-'));
    let verified: unknown;
    try {
      const exactRecordPath = join(temporary, 'review-record.json');
      const exactBundlePath = join(temporary, 'attestation-bundle.json');
      writeFileSync(exactRecordPath, recordBytes, { flag: 'wx', mode: 0o600 });
      writeFileSync(exactBundlePath, bundleBytes, { flag: 'wx', mode: 0o600 });
      verified = runGh('gh', ['attestation', 'verify', exactRecordPath, '--bundle', exactBundlePath, '--format', 'json', '--repo', (expected as ExpectedView).repository,
        '--signer-repo', (expected as ExpectedView).repository], {
        encoding: 'utf8', maxBuffer: MAX_RECORD_BYTES, timeout: 30_000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (error) {
      fail(`GitHub attestation verification failed: ${(error as { message: unknown }).message}`);
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    let parsed: unknown;
    try { parsed = JSON.parse(typeof verified === 'string' ? verified : (verified as { toString(encoding: string): string }).toString('utf8')); }
    catch { fail('GitHub attestation verifier output is malformed JSON.'); }
    return inspectOwnerAmendmentAttestation({ recordBytes, verified: parsed, expected });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: (error as { message: unknown }).message });
  }
}
