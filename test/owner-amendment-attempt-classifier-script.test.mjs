import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const repository = 'flair-agency/architecture-gatekeeper';
const bSha = 'b'.repeat(40);
const policy = { version: 2, default: { mode: 'local-only' }, branches: { main: {
  mode: 'enforced', model: 'gpt-6.1-sol', reasoningEffort: 'medium',
  authorityManifestPath: '.codex/gatekeeper/authorities.json',
  authorityLimits: { maxManifestBytes: 16_384, maxMembers: 16, maxFileBytes: 73_728,
    maxTotalBytes: 262_144, maxPromptBytes: 524_288 },
  ownerAmendment: { version: 1, grade: 'G0', scope: 'authority-only',
    triggerProfile: 'completed-block-v1', authorityId: 'architecture-contract',
    authorityPath: 'docs/architecture.md', evidenceProducer: 'github-actions-attestation',
    tagNamespace: 'refs/tags/architecture-gatekeeper/amendments', maxPromptBytes: 262_144 },
} } };

test('acceptance guard reads policy from the exact protected base, not the shallow runtime checkout', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const acceptanceGuard = workflow.match(/- name: Recheck exact B amendment tag at final acceptance boundary\n([\s\S]*?)\n      - name: Require model-backed PASS/)?.[1];
  assert.ok(acceptanceGuard);
  const protectedBaseCheckout = workflow.match(/- name: Check out the exact protected base for amendment policy recheck\n([\s\S]*?)\n      - name: Recheck exact B amendment tag/)?.[1];
  assert.ok(protectedBaseCheckout);
  assert.match(protectedBaseCheckout, /repository: \$\{\{ github\.repository \}\}/);
  assert.match(protectedBaseCheckout, /ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(protectedBaseCheckout, /path: \.architecture-gatekeeper-protected-base/);
  assert.match(acceptanceGuard, /PROTECTED_POLICY_PATH: \$\{\{ github\.workspace \}\}\/\.architecture-gatekeeper-protected-base/);
  assert.match(acceptanceGuard, /node \.architecture-gatekeeper-runtime\/scripts\/owner-amendment-attempt-classifier\.mjs acceptance-guard/);

  const root = mkdtempSync(path.join(tmpdir(), 'agk-tag-acceptance-'));
  try {
    const workspace = path.join(root, 'workspace');
    const runtime = path.join(workspace, '.architecture-gatekeeper-runtime');
    const policyCheckout = path.join(workspace, '.architecture-gatekeeper-protected-base');
    const source = path.join(root, 'source');
    const policyPath = path.join(source, '.codex/gatekeeper/ci-policy.json');
    const bin = path.join(root, 'bin');
    mkdirSync(workspace, { recursive: true });
    mkdirSync(path.dirname(policyPath), { recursive: true });
    mkdirSync(bin);
    writeFileSync(policyPath, `${JSON.stringify(policy)}\n`);
    execFileSync('git', ['init', '-q', '-b', 'main', source]);
    execFileSync('git', ['-C', source, 'config', 'user.name', 'Fixture']);
    execFileSync('git', ['-C', source, 'config', 'user.email', 'fixture@example.invalid']);
    execFileSync('git', ['-C', source, 'add', '.codex/gatekeeper/ci-policy.json']);
    execFileSync('git', ['-C', source, 'commit', '-qm', 'protected base policy']);
    const protectedBaseSha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    writeFileSync(policyPath, `${JSON.stringify({ version: 2, default: { mode: 'local-only' }, branches: {} })}\n`);
    execFileSync('git', ['-C', source, 'add', '.codex/gatekeeper/ci-policy.json']);
    execFileSync('git', ['-C', source, 'commit', '-qm', 'newer workflow revision']);
    rmSync(policyPath);
    execFileSync('git', ['-C', source, 'add', '-u', '.codex/gatekeeper/ci-policy.json']);
    execFileSync('git', ['-C', source, 'commit', '-qm', 'policy absent at this revision']);
    const policyAbsentSha = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const fileUrl = `file://${source}`;
    execFileSync('git', ['clone', '--quiet', '--depth', '1', fileUrl, runtime]);
    execFileSync('git', ['clone', '--quiet', '--no-checkout', '--depth', '1', fileUrl, policyCheckout]);
    execFileSync('git', ['-C', policyCheckout, 'fetch', '--quiet', '--depth', '1', 'origin', protectedBaseSha]);
    execFileSync('git', ['-C', policyCheckout, 'checkout', '--quiet', '--detach', protectedBaseSha]);
    assert.notEqual(execFileSync('git', ['-C', runtime, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), protectedBaseSha);
    assert.throws(() => execFileSync('git', ['-C', runtime, 'cat-file', '-e', `${protectedBaseSha}^{commit}`], { stdio: 'ignore' }));
    const ghPath = path.join(bin, 'gh');
    writeFileSync(ghPath, '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$FIXTURE_ARGS"\nprintf "HTTP/2 %s\\n{}\\n" "$FIXTURE_STATUS"\n');
    chmodSync(ghPath, 0o755);
    const classifier = new URL('../scripts/owner-amendment-attempt-classifier.mjs', import.meta.url).pathname;
    const env = { GITHUB_WORKSPACE: workspace, PROTECTED_POLICY_PATH: policyCheckout,
      GITHUB_REPOSITORY: repository, BASE_SHA: protectedBaseSha, B_SHA: bSha, BASE_BRANCH: 'main',
      TRIGGER_PROFILE: 'completed-block-v1', GH_TOKEN: 'fixture-token',
      FIXTURE_ARGS: path.join(root, 'gh-args.txt'), PATH: `${bin}:/usr/bin:/bin` };
    const run = status => execFileSync(process.execPath, [classifier, 'acceptance-guard'], {
      encoding: 'utf8', env: { ...env, FIXTURE_STATUS: String(status) },
    });
    const assertFailsClosed = (selectedEnv, pattern) => assert.throws(() => execFileSync(
      process.execPath, [classifier, 'acceptance-guard'], {
        encoding: 'utf8', env: selectedEnv, stdio: ['ignore', 'pipe', 'pipe'],
      }), pattern);

    assert.deepEqual(JSON.parse(run(404)), {
      status: 'OWNER_AMENDMENT_NOT_APPLICABLE', attempted: false, tagRef: null,
    });
    assert.deepEqual(readFileSync(env.FIXTURE_ARGS, 'utf8').trim().split('\n'), [
      'api', '--include', `repos/${repository}/git/ref/tags/architecture-gatekeeper/amendments/${bSha}`,
    ]);
    assert.throws(() => run(200), /tag is present at final acceptance/);
    assert.throws(() => run(503), /unexpected HTTP status 503/);
    assertFailsClosed({ ...env, PROTECTED_POLICY_PATH: runtime, FIXTURE_STATUS: '404' },
      /does not match the exact protected base revision/);
    assertFailsClosed({ ...env, PROTECTED_POLICY_PATH: path.join(workspace, 'missing'), FIXTURE_STATUS: '404' },
      /exact protected-base policy checkout is unavailable/);
    const noPolicyPath = { ...env, PROTECTED_RUNTIME_PATH: runtime };
    delete noPolicyPath.PROTECTED_POLICY_PATH;
    assertFailsClosed(noPolicyPath, /protected policy Git checkout is unavailable/);
    assertFailsClosed({ ...env, BASE_SHA: 'c'.repeat(40), FIXTURE_STATUS: '404' },
      /does not match the exact protected base revision/);

    execFileSync('git', ['-C', policyCheckout, 'fetch', '--quiet', '--depth', '1', 'origin', policyAbsentSha]);
    execFileSync('git', ['-C', policyCheckout, 'checkout', '--quiet', '--detach', policyAbsentSha]);
    assertFailsClosed({ ...env, BASE_SHA: policyAbsentSha, FIXTURE_STATUS: '404' },
      /protected policy is unavailable at the recorded base revision/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
