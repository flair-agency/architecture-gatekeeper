import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
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
  assert.match(caller, /pull_request_target:\s*\n\s+branches: \[main\]/);
  assert.match(caller, /head\.repo\.id == github\.repository_id/);
  assert.match(caller, /base\.repo\.id == github\.repository_id/);
  assert.match(caller, /head\.repo\.full_name == github\.repository/);
  assert.match(caller, /base\.repo\.full_name == github\.repository/);
  assert.doesNotMatch(caller, /actions\/checkout|^\s+run:/m);
  assert.match(readFileSync(join(rootDir, '.codex/gatekeeper/ci-prompt.md'), 'utf8'), /at least one concise `reviewedScope`\s+item/);
});
