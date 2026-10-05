import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const workflow = await readFile(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
const stepStart = workflow.indexOf('- name: Classify trusted base and head repository IDs');
const runStart = workflow.indexOf('        run: |\n', stepStart);
assert.ok(stepStart >= 0 && runStart > stepStart, 'trusted metadata classifier run block must be present');
const runLines = workflow.slice(runStart + '        run: |\n'.length).split('\n');
const scriptLines = [];
for (const line of runLines) {
  if (line && !line.startsWith('          ')) break;
  scriptLines.push(line ? line.slice(10) : '');
}
const script = scriptLines.join('\n');

function event({ repositoryId = 123, baseId = 123, headId = 123, number = 45,
  baseSha = 'a'.repeat(40), headSha = 'b'.repeat(40), sender = {} } = {}) {
  return {
    repository: { id: repositoryId },
    pull_request: {
      number,
      base: { sha: baseSha, repo: { id: baseId } },
      head: { sha: headSha, repo: { id: headId } },
      user: { login: 'candidate', ...sender },
    },
  };
}

test('self caller classifies only complete numeric repository metadata before the reusable workflow', () => {
  const classifierJob = workflow.slice(workflow.indexOf('  classify-self-repository:'), workflow.indexOf('  architecture-gate:'));
  const callerJob = workflow.slice(workflow.indexOf('  architecture-gate:'), workflow.indexOf('  deny-unreviewed-fork:'));
  const denialJob = workflow.slice(workflow.indexOf('  deny-unreviewed-fork:'));
  assert.match(classifierJob, /contents: none/);
  assert.match(classifierJob, /id-token: none/);
  assert.doesNotMatch(classifierJob, /secrets\.|OPENAI_API_KEY|id-token: write|attestations: write/);
  assert.match(callerJob, /needs: classify-self-repository/);
  assert.match(callerJob, /outputs\.classification == 'same-repository'/);
  assert.match(denialJob, /name: architecture-gate \/ accept/);
  assert.match(denialJob, /if: always\(\).*classification != 'same-repository'/);
  assert.match(denialJob, /exit 1/);
  assert.match(denialJob, /id-token: none/);
  assert.match(workflow, /no privileged review, provider\/source credential, OIDC capability, or paid review was admitted/i);
});

test('classifier distinguishes same-repository PRs from every cross-repository head and fails closed on unknown metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agk-self-fork-'));
  try {
    const classify = async (fixture, expected = '123', expectedPullRequest = '45') => {
      const eventPath = join(directory, 'event.json');
      const outputPath = join(directory, 'output');
      await writeFile(eventPath, JSON.stringify(fixture));
      await writeFile(outputPath, '');
      const result = spawnSync('bash', ['-euo', 'pipefail', '-c', script], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath,
          GITHUB_EVENT_NAME: 'pull_request_target', EXPECTED_REPOSITORY_ID: expected,
          EXPECTED_PULL_REQUEST_NUMBER: expectedPullRequest },
      });
      assert.equal(result.status, 0, result.stderr);
      return (await readFile(outputPath, 'utf8')).trim().split('=')[1];
    };

    assert.equal(await classify(event()), 'same-repository');
    assert.equal(await classify(event({ headId: 456 })), 'cross-repository');
    assert.equal(await classify(event({ headId: 456, sender: { login: 'maintainer', author_association: 'OWNER' } })), 'cross-repository');

    const malformed = [
      event({ repositoryId: '123' }),
      event({ baseId: '123' }),
      event({ headId: null }),
      event({ repositoryId: 124 }),
      event({ baseSha: 'not-a-commit' }),
      event({ number: 0 }),
      event({ number: 46 }),
      { repository: { id: 123 }, pull_request: null },
    ];
    for (const fixture of malformed) assert.equal(await classify(fixture), 'unknown');
    assert.equal(await classify(event(), '01'), 'unknown');
    const wrongEvent = await classify(event(), '123', '44');
    assert.equal(wrongEvent, 'unknown');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('renamed deferred targets preserve the original public documentation fragments', async () => {
  const architecture = await readFile(new URL('../docs/architecture.md', import.meta.url), 'utf8');
  const readme = await readFile(new URL('../docs/README.md', import.meta.url), 'utf8');
const execution = await readFile(new URL('../docs/architecture/review-execution.md', import.meta.url), 'utf8');
  const forkAnchor = 'target-fork-pr-review-authorization-issue-331-owner-direction-2026-10-04';
  const environmentAnchor = 'owner-selected-initial-public-fork-environment-profile-target-issue-331-2026-10-04';
  assert.match(architecture, new RegExp(`#${forkAnchor}`));
  assert.match(readme, new RegExp(`#${forkAnchor}`));
  assert.match(execution, new RegExp(`<a id="${forkAnchor}">`));
  assert.match(execution, new RegExp(`<a id="${environmentAnchor}">`));
});
