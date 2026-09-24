import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, unlinkSync, symlinkSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { POLICY_PATH, INTENT_PATH, MECHANISM, canonical, digest, git, inputDigest, simulateAcceptance } from './prototype.mjs';

function fixture(t, mutateHead = () => {}) {
  const repo = mkdtempSync(join(tmpdir(), 'issue75-fixture-'));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const write = (path, value) => writeFileSync(join(repo, path), typeof value === 'string' ? value : `${canonical(value)}\n`);
  const sshKey = name => {
    const path = join(repo, name);
    execFileSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', 'temporary-poc-only', '-f', path]);
    return { path, public: readFileSync(`${path}.pub`, 'utf8').trim().split(' ').slice(0, 2).join(' ') };
  };
  git(repo, ['init', '-q', '--initial-branch=main']);
  git(repo, ['config', 'user.name', 'PoC fixture']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  const owner = sshKey('owner-key');
  const rogue = sshKey('untrusted-key');
  const reviewer = generateKeyPairSync('ed25519');
  const policy = {
    schema: 'issue75-poc-policy/v1', enabled: true,
    repository: 'fixture:architecture-gatekeeper',
    allowedPaths: ['authority.md'], reviewInputs: ['authority.md', 'review-inputs.json'],
    ownerKey: owner.public,
    reviewerKey: reviewer.publicKey.export({ type: 'spki', format: 'pem' }),
  };
  write(POLICY_PATH, policy);
  write('authority.md', 'Old contract: BLOCK rejects every change.\n');
  write('review-inputs.json', { prompt: 'Evaluate against old authority.', schema: ['PASS', 'BLOCK', 'OWNER_DECISION'], reviewer: 'fixture-service', validation: 'complete result required' });
  git(repo, ['add', POLICY_PATH, 'authority.md', 'review-inputs.json']);
  git(repo, ['commit', '-qm', 'Protected old authority and experimental policy']);
  const base = git(repo, ['rev-parse', 'HEAD']);
  const intent = { schema: 'issue75-poc-intent/v1', reason: 'Owner proposes a bounded contract amendment.', paths: ['authority.md'] };
  write(INTENT_PATH, intent);
  write('authority.md', 'Proposed contract: separately authenticated owner amendments may be accepted.\n');
  git(repo, ['add', INTENT_PATH, 'authority.md']);
  mutateHead({ repo, write, policy, intent });
  git(repo, ['commit', '-qm', 'Direct authority-only amendment B']);
  const context = {
    repository: policy.repository, changeId: 'fixture-change-B', base,
    head: git(repo, ['rev-parse', 'HEAD']), challenge: randomBytes(16).toString('hex'),
  };
  const signReview = (overrides = {}, key = reviewer.privateKey) => {
    const payload = {
      schema: 'issue75-poc-review/v1', ...context, mechanism: MECHANISM,
      inputDigest: inputDigest(repo, base, policy), complete: true, semantic: 'BLOCK', ...overrides,
    };
    return { payload, signature: sign(null, Buffer.from(canonical(payload)), key).toString('base64') };
  };
  const review = signReview();
  let count = 0;
  const makeTag = (selectedReview = review, { key = owner, overrides = {}, unsigned = false } = {}) => {
    const attestation = {
      schema: 'issue75-poc-attestation/v1', ...context,
      reviewDigest: digest(selectedReview), intentDigest: digest(intent), ...overrides,
    };
    const messageFile = join(repo, 'attestation-message');
    writeFileSync(messageFile, `${canonical(attestation)}\n`);
    const name = `amendment-${++count}`;
    git(repo, ['-c', 'gpg.format=ssh', '-c', `user.signingkey=${key.path}`, 'tag', unsigned ? '-a' : '-s', '-F', messageFile, name, context.head]);
    return git(repo, ['rev-parse', `refs/tags/${name}`]);
  };
  const tagOid = makeTag();
  const request = { repo, context, review, tagOid };
  return { ...request, request, policy, intent, write, signReview, makeTag, rogue };
}

function rejects(request, pattern) {
  const result = simulateAcceptance(request);
  assert.equal(result.acceptance, 'REJECT', JSON.stringify(result));
  if (pattern) assert.match(result.reason, pattern);
}

test('direct amendment B: authentic BLOCK remains BLOCK; acceptance is independently OWNER_AMENDMENT', t => {
  const f = fixture(t);
  assert.deepEqual(simulateAcceptance(f.request), { experimental: true, acceptance: 'OWNER_AMENDMENT', semantic: 'BLOCK' });
  assert.deepEqual(Object.keys(f.intent).sort(), ['paths', 'reason', 'schema']);
  assert.equal(git(f.repo, ['rev-parse', 'HEAD']), f.context.head, 'review and tag creation never change head');
  assert.equal(git(f.repo, ['status', '--porcelain', '--untracked-files=no']), '');
  assert.match(git(f.repo, ['show', `${f.context.base}:authority.md`]), /Old contract/);
  assert.notEqual(inputDigest(f.repo, f.context.base, f.policy), inputDigest(f.repo, f.context.head, f.policy));
  // Same-state verification is intentionally idempotent; no acceptance ledger is claimed.
  assert.equal(simulateAcceptance(f.request).acceptance, 'OWNER_AMENDMENT');
});

test('freshness and cross-context replay: updated head, base, repository, change ID or challenge reject', t => {
  const f = fixture(t);
  f.write('authority.md', 'A later head has different authority.\n');
  git(f.repo, ['add', 'authority.md']);
  git(f.repo, ['commit', '-qm', 'Later change']);
  rejects({ ...f.request, context: { ...f.context, head: git(f.repo, ['rev-parse', 'HEAD']) } }, /head mismatch/);
  for (const patch of [
    { base: f.context.head }, { repository: 'fixture:other' },
    { changeId: 'fixture-change-C' }, { challenge: 'new-protected-challenge' },
  ]) rejects({ ...f.request, context: { ...f.context, ...patch } });
});

test('missing, modified or untrusted review cannot be rescued by genuine owner signature', t => {
  const f = fixture(t);
  rejects({ ...f.request, review: undefined }, /review envelope/);
  const forged = structuredClone(f.review);
  forged.payload.inputDigest = 'forged';
  rejects({ ...f.request, review: forged, tagOid: f.makeTag(forged) }, /review signature/);
  const rogueReview = f.signReview({}, generateKeyPairSync('ed25519').privateKey);
  rejects({ ...f.request, review: rogueReview, tagOid: f.makeTag(rogueReview) }, /review signature/);
});

test('service failure, non-BLOCK and wrong protected inputs are not amendment evidence', t => {
  const f = fixture(t);
  for (const patch of [{ complete: false }, { semantic: 'OWNER_DECISION' }, { semantic: 'PASS' }, { inputDigest: 'wrong-inputs' }]) {
    const review = f.signReview(patch);
    rejects({ ...f.request, review, tagOid: f.makeTag(review) });
  }
});

test('unsigned, untrusted-owner or altered tag is rejected', t => {
  const f = fixture(t);
  rejects({ ...f.request, tagOid: f.makeTag(f.review, { unsigned: true }) });
  rejects({ ...f.request, tagOid: f.makeTag(f.review, { key: f.rogue }) });
  const original = git(f.repo, ['cat-file', 'tag', f.tagOid]);
  const forgedPath = join(f.repo, 'forged-tag');
  writeFileSync(forgedPath, original.replace('fixture-change-B', 'fixture-change-C'));
  const forgedOid = git(f.repo, ['hash-object', '-t', 'tag', '-w', forgedPath]);
  rejects({ ...f.request, tagOid: forgedOid });
});

test('genuine owner signature must bind actual review, intent and current context', t => {
  const f = fixture(t);
  for (const overrides of [{ reviewDigest: 'wrong' }, { intentDigest: 'wrong' }, { base: f.context.head }, { changeId: 'other' }]) {
    rejects({ ...f.request, tagOid: f.makeTag(f.review, { overrides }) });
  }
});

test('a signed implementation or trust-root change cannot pass authority-only scope', t => {
  for (const path of ['implementation.mjs', POLICY_PATH]) {
    const f = fixture(t, ({ repo, write }) => {
      write(path, path === POLICY_PATH ? '{"enabled":true,"ownerKey":"candidate-key"}\n' : 'console.log("must not execute");\n');
      git(repo, ['add', path]);
    });
    rejects(f.request, /undeclared paths/);
  }
});

test('a candidate cannot activate the route when protected policy has disabled it', t => {
  const f = fixture(t);
  // Produce a new protected fixture base with the route disabled, then rebase B.
  git(f.repo, ['checkout', '-q', '-b', 'disabled', f.context.base]);
  f.write(POLICY_PATH, { ...f.policy, enabled: false });
  git(f.repo, ['add', POLICY_PATH]);
  git(f.repo, ['commit', '-qm', 'Disable experiment in protected policy']);
  const base = git(f.repo, ['rev-parse', 'HEAD']);
  git(f.repo, ['cherry-pick', f.context.head]);
  rejects({ ...f.request, context: { ...f.context, base, head: git(f.repo, ['rev-parse', 'HEAD']) } }, /not enabled/);
});

test('intent cannot contain a self OID or review digest', t => {
  const f = fixture(t, ({ repo, write, intent }) => {
    write(INTENT_PATH, { ...intent, reviewDigest: 'would-require-a-new-commit' });
    git(repo, ['add', INTENT_PATH]);
  });
  rejects(f.request, /intent: unexpected/);
});

test('authority symlinks and executable modes reject even with genuine evidence', t => {
  for (const mode of ['symlink', 'executable']) {
    const f = fixture(t, ({ repo }) => {
      const path = join(repo, 'authority.md');
      if (mode === 'symlink') {
        unlinkSync(path);
        symlinkSync('outside-authority.md', path);
      } else {
        chmodSync(path, 0o755);
      }
      git(repo, ['add', 'authority.md']);
    });
    rejects(f.request, /regular file required/);
  }
});
