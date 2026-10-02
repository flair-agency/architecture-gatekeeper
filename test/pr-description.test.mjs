import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = readFileSync(new URL('../.github/workflows/pr-description.yml', import.meta.url), 'utf8');
const script = workflow.match(/node --input-type=module <<'JS'\n([\s\S]*?)          JS/)[1]
  .split('\n').map(line => line.replace(/^          /, '')).join('\n');
const valid = `## Outcome
Makes the delivery record explicit.
## Issue coverage
Refs #282. Covers templates and description validation.
## Verification
Focused metadata cases passed; no semantic acceptance is claimed.
## Remaining work
#252 owns CI adoption; #265 owns committed reviewer configuration.
## Authority and assurance
N/A — no canonical responsibilities or acceptance policy change.
`;
function run(body) {
  const directory = mkdtempSync(join(tmpdir(), 'pr-description-'));
  try {
    const event = join(directory, 'event.json');
    const summary = join(directory, 'summary.md');
    writeFileSync(event, JSON.stringify({ pull_request: { body } }));
    const result = spawnSync(process.execPath, ['--input-type=module', '-'], {
      input: script, encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_PATH: event, GITHUB_STEP_SUMMARY: summary },
    });
    return { ...result, summary: readFileSync(summary, 'utf8') };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
test('accepts partial delivery with owned remaining work', () => {
  const result = run(valid);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.summary, /does not verify claims/);
});
test('accepts explained non-applicable issue and no remaining work', () => {
  const body = valid.replace('Refs #282. Covers templates and description validation.', 'N/A — fixes a typo without a tracking issue.')
    .replace('#252 owns CI adoption; #265 owns committed reviewer configuration.', 'None — this PR completes the stated typo correction.');
  assert.equal(run(body).status, 0);
});
test('rejects missing or duplicate required sections', () => {
  assert.equal(run(valid.replace('## Verification', '## Checks')).status, 1);
  assert.equal(run(valid + '\n## Verification\nPassed.').status, 1);
});
test('ignores template instructions and rejects placeholders', () => {
  assert.equal(run(valid.replace('Makes the delivery record explicit.', '<!-- describe outcome -->')).status, 1);
  assert.equal(run(valid.replace('Makes the delivery record explicit.', 'TBD')).status, 1);
  assert.equal(run(valid.replace('Makes the delivery record explicit.', '- [ ]')).status, 1);
});
test('does not accept headings hidden in a fenced example', () => {
  for (const [opening, closing] of [['```md', '```'], ['```md', '````'], ['~~~md', '~~~~'], ['````md', '```'], ['```md', '']]) {
    assert.equal(run(opening + '\n' + valid + closing).status, 1);
  }
  assert.equal(run('<!-- unclosed comment\n' + valid).status, 1);
});
test('rejects unowned remaining work and bare N/A', () => {
  assert.equal(run(valid.replace('#252 owns CI adoption; #265 owns committed reviewer configuration.', 'Later work remains.')).status, 1);
  assert.equal(run(valid.replace('Refs #282. Covers templates and description validation.', 'N/A')).status, 1);
});
test('handles absent body and treats shell/workflow commands as inert text', () => {
  assert.equal(run(null).status, 1);
  const result = run(valid.replace('Makes the delivery record explicit.', '$(exit 91) `exit 92` ::error::untrusted'));
  assert.equal(result.status, 0);
  assert.doesNotMatch(result.summary, /untrusted|exit 91/);
});
test('metadata workflow has no checkout, secrets, write permission or PR interpolation', () => {
  assert.match(workflow, /pull_request_target:/);
  assert.match(workflow, /permissions: \{\}/);
  assert.doesNotMatch(workflow, /uses:|secrets\.|\$\{\{ github\.event\.pull_request\.body/);
});
