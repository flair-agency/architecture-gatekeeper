import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createReviewRequestAsync, validateReviewResponse } from '../src/review-contract/review-contract.mts';

test('consumer v2 local example prompt and schema match the prepared response contract', async t => {
  const rootDir = mkdtempSync(join(tmpdir(), 'architecture-gatekeeper-example-v2-'));
  t.after(() => rmSync(rootDir, { recursive: true, force: true }));
  const example = fileURLToPath(new URL('../examples/consumer-v4/', import.meta.url));
  cpSync(example, rootDir, { recursive: true });
  const git = (...args) => execFileSync('git', args, { cwd: rootDir, stdio: 'ignore' });
  git('init', '-b', 'main');
  git('config', 'user.name', 'Fixture');
  git('config', 'user.email', 'fixture@example.invalid');
  git('add', '.');
  git('commit', '-m', 'consumer v2 local example');

  const request = await createReviewRequestAsync('Review the sample consumer.', rootDir);
  assert.equal(request.version, 2);
  assert.deepEqual(request.authoritySet.members.map(member => member.id), ['architecture', 'security']);
  assert.doesNotMatch(request.prompt, /authority set digest|set digest/i);
  assert.match(request.prompt, /Report exactly these IDs in authorityIds/);
  assert.match(request.prompt, /at least one concise `reviewedScope` item/);

  const localSchema = JSON.parse(readFileSync(join(rootDir, '.codex/gatekeeper/local-decision.schema.json'), 'utf8'));
  const ciSchema = JSON.parse(readFileSync(join(rootDir, '.codex/gatekeeper/decision.schema.json'), 'utf8'));
  assert.equal(localSchema.properties.reviewedScope.minItems, 1);
  assert.equal(ciSchema.properties.reviewedScope.minItems, 1);

  const validated = validateReviewResponse(request, {
    decision: 'PASS',
    summary: 'The change follows the selected consumer rules.',
    authorityIds: ['architecture', 'security'],
    reviewedScope: ['sample change'],
    ownerDecisionId: '',
  });
  assert.equal(validated.decision, 'PASS');
  assert.equal(validated.authoritySet.setDigest, request.authoritySet.setDigest);
  assert.throws(() => validateReviewResponse(request, {
    decision: 'PASS', summary: 'The change follows the selected consumer rules.',
    authorityIds: ['architecture', 'security'], reviewedScope: [], ownerDecisionId: '',
  }), /schema validation failed/);

  const caller = readFileSync(join(rootDir, '.github/workflows/architecture-gate.yml'), 'utf8');
  assert.match(caller, /^  pull_request_target:\s*\n    branches: \[main\]$/m);
  assert.match(caller, /^  same-repository-admission:\n    permissions: \{\}/m);
  const admissionBody = caller.slice(caller.indexOf('  same-repository-admission:'), caller.indexOf('  architecture-gate:'));
  assert.doesNotMatch(admissionBody, /OPENAI_API_KEY|secrets\./);
  assert.doesNotMatch(admissionBody, /GITHUB_TOKEN|github\.token|actions\/checkout|head\.sha|git checkout|npm (?:ci|run)|make (?:test|build)/i);
  assert.match(readFileSync(join(rootDir, 'README.md'), 'utf8'), /admission step only\s+parses event JSON, has no token permissions, and receives no secrets/);
  assert.match(caller, /^  architecture-gate:\n    needs: same-repository-admission\n    if: needs\.same-repository-admission\.result == 'success' && needs\.same-repository-admission\.outputs\.admitted == 'true'$/m);
  assert.match(caller, /^      OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}$/m);
  assert.match(readFileSync(join(rootDir, 'README.md'), 'utf8'), /require `same-repository-admission` and the pinned reusable\s+workflow's nested `architecture-gate \/ accept` check/);
  const classifier = caller.match(/^ {10}node --input-type=module <<'NODE'\n([\s\S]*?)^ {10}NODE\s*$/m)?.[1]?.replace(/^ {10}/gm, '');
  assert.ok(classifier, 'admission job contains the inline classifier');
  const repository = { id: 481516, full_name: 'acme/example' };
  const sameRepoEvent = { repository, pull_request: { base: { repo: repository }, head: { repo: repository } } };
  const cases = [
    ['same repository', 'pull_request_target', '481516', 'acme/example', sameRepoEvent, 0],
    ['cross repository head', 'pull_request_target', '481516', 'acme/example', {
      ...sameRepoEvent, pull_request: { ...sameRepoEvent.pull_request, head: { repo: { id: 77, full_name: 'fork/example' } } },
    }, 1],
    ['cross repository name', 'pull_request_target', '481516', 'acme/example', {
      ...sameRepoEvent, pull_request: { ...sameRepoEvent.pull_request, head: { repo: { id: 481516, full_name: 'fork/example' } } },
    }, 1],
    ['missing head repository', 'pull_request_target', '481516', 'acme/example', {
      ...sameRepoEvent, pull_request: { ...sameRepoEvent.pull_request, head: { repo: null } },
    }, 1],
    ['missing repository payload', 'pull_request_target', '481516', 'acme/example', {
      ...sameRepoEvent, repository: null,
    }, 1],
    ['mismatched base identity', 'pull_request_target', '481516', 'acme/example', {
      ...sameRepoEvent, pull_request: { ...sameRepoEvent.pull_request, base: { repo: { id: 99, full_name: 'acme/example' } } },
    }, 1],
  ];
  for (const [label, eventName, repoId, repoName, event, expectedStatus] of cases) {
    const eventPath = join(rootDir, `event-${label.replaceAll(' ', '-')}.json`);
    const outputPath = join(rootDir, `output-${label.replaceAll(' ', '-')}.txt`);
    writeFileSync(eventPath, JSON.stringify(event));
    writeFileSync(outputPath, '');
    const result = spawnSync(process.execPath, ['--input-type=module', '-e', classifier], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: eventName, GITHUB_EVENT_PATH: eventPath,
        GITHUB_OUTPUT: outputPath, EXPECTED_REPOSITORY: repoName, EXPECTED_REPOSITORY_ID: repoId },
    });
    assert.equal(result.status, expectedStatus, `${label}: ${result.stderr}`);
    const output = readFileSync(outputPath, 'utf8');
    assert.equal(output, expectedStatus === 0 ? 'admitted=true\n' : '', `${label} admission output`);
  }
  assert.match(readFileSync(join(rootDir, '.codex/gatekeeper/ci-prompt.md'), 'utf8'), /at least one concise `reviewedScope`\s+item/);
});
