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

test('acceptance guard reads protected policy from its nested runtime checkout', () => {
  const workflow = readFileSync(new URL('../.github/workflows/architecture-gate.yml', import.meta.url), 'utf8');
  const acceptanceGuard = workflow.match(/- name: Recheck exact B amendment tag at final acceptance boundary\n([\s\S]*?)\n      - name: Require model-backed PASS/)?.[1];
  assert.ok(acceptanceGuard);
  assert.match(acceptanceGuard, /PROTECTED_RUNTIME_PATH: \$\{\{ github\.workspace \}\}\/\.architecture-gatekeeper-runtime/);
  assert.match(acceptanceGuard, /node \.architecture-gatekeeper-runtime\/scripts\/owner-amendment-attempt-classifier\.mjs acceptance-guard/);

  const root = mkdtempSync(path.join(tmpdir(), 'agk-tag-acceptance-'));
  try {
    const workspace = path.join(root, 'workspace');
    const runtime = path.join(workspace, '.architecture-gatekeeper-runtime');
    const policyPath = path.join(runtime, '.codex/gatekeeper/ci-policy.json');
    const bin = path.join(root, 'bin');
    mkdirSync(path.dirname(policyPath), { recursive: true });
    mkdirSync(bin);
    writeFileSync(policyPath, `${JSON.stringify(policy)}\n`);
    execFileSync('git', ['init', '-q', '-b', 'main', runtime]);
    execFileSync('git', ['-C', runtime, 'config', 'user.name', 'Fixture']);
    execFileSync('git', ['-C', runtime, 'config', 'user.email', 'fixture@example.invalid']);
    execFileSync('git', ['-C', runtime, 'add', '.codex/gatekeeper/ci-policy.json']);
    execFileSync('git', ['-C', runtime, 'commit', '-qm', 'fixture policy']);
    const protectedBaseSha = execFileSync('git', ['-C', runtime, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
    const ghPath = path.join(bin, 'gh');
    writeFileSync(ghPath, '#!/bin/sh\nprintf "HTTP/2 %s\\n{}\\n" "$FIXTURE_STATUS"\n');
    chmodSync(ghPath, 0o755);
    const classifier = new URL('../scripts/owner-amendment-attempt-classifier.mjs', import.meta.url).pathname;
    const env = { GITHUB_WORKSPACE: workspace, PROTECTED_RUNTIME_PATH: runtime,
      GITHUB_REPOSITORY: repository, BASE_SHA: protectedBaseSha, B_SHA: bSha, BASE_BRANCH: 'main',
      TRIGGER_PROFILE: 'completed-block-v1', GH_TOKEN: 'fixture-token', PATH: `${bin}:/usr/bin:/bin` };
    const run = status => execFileSync(process.execPath, [classifier, 'acceptance-guard'], {
      encoding: 'utf8', env: { ...env, FIXTURE_STATUS: String(status) },
    });

    assert.deepEqual(JSON.parse(run(404)), {
      status: 'OWNER_AMENDMENT_NOT_APPLICABLE', attempted: false, tagRef: null,
    });
    assert.throws(() => run(200), /tag is present at final acceptance/);
    assert.throws(() => run(503), /unexpected HTTP status 503/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
