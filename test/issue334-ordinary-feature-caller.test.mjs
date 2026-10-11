import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { readWorkflow } from './helpers/workflow-structure.mjs';

const callerPath = '../../.github/workflows/issue334-ordinary-feature-caller.yml';
const source = await readFile(new URL('../.github/workflows/issue334-ordinary-feature-caller.yml', import.meta.url), 'utf8');
const workflow = readWorkflow(callerPath).workflow;

function assertStaged(candidate) {
  assert.deepEqual(candidate.on.pull_request_target, {
    branches: ['feature/gemini-ci'],
    types: ['ready_for_review'],
  });
  assert.deepEqual(Object.keys(candidate.on), ['pull_request_target']);
  assert.deepEqual(candidate.jobs['classify-self-repository'].permissions,
    { contents: 'none', 'id-token': 'none' });
  assert.equal(candidate.jobs['architecture-gate'].if, false);
  assert.deepEqual(candidate.jobs['architecture-gate'].permissions,
    { contents: 'read', actions: 'read', 'pull-requests': 'write', 'id-token': 'write' });
  assert.equal(candidate.jobs['architecture-gate'].uses,
    'flair-agency/architecture-gatekeeper/.github/workflows/architecture-gate-providers.yml@7dc99525b4ff1510f1de310f6f5b877ab05bbfd2');
  assert.deepEqual(candidate.jobs['architecture-gate'].with, {
    'policy-path': '.codex/gatekeeper/gemini-verification-policy.json',
    'prompt-path': '.codex/gatekeeper/ci-prompt.md',
    'schema-path': '.codex/gatekeeper/ci-decision.schema.json',
    'validation-path': '.codex/gatekeeper/decision.validation.json',
    'protected-review-instructions': true,
  });
  assert.deepEqual(Object.keys(candidate.jobs['architecture-gate'].secrets).sort(),
    ['GCP_WIF_PROVIDER', 'GCP_WIF_SERVICE_ACCOUNT']);
  assert.equal(candidate.jobs['architecture-gate'].secrets.OPENAI_API_KEY, undefined);
  assert.equal(candidate.jobs['architecture-gate'].secrets['CI_SOURCE_READ_TOKEN'], undefined);
  assert.doesNotMatch(JSON.stringify(candidate), /secrets:\s*inherit|OPENAI_API_KEY|CI_SOURCE_READ_TOKEN|workflow_dispatch|schedule|push:/);
}

test('ordinary Gemini caller is ready-only, pinned, least privilege, and unconditionally inactive', () => {
  assertStaged(workflow);
  assert.match(source, /if: false\n/);
  assert.match(source, /Proposed activation guard for separately authorized activation; this text is not active admission:[\s\S]*\n    if: false/);
  assert.match(source, /# if: \$\{\{ needs\.classify-self-repository\.outputs\.classification == 'same-repository' && github\.event_name == 'pull_request_target' && github\.event\.action == 'ready_for_review' && github\.event\.pull_request\.draft == false && github\.event\.pull_request\.number == 517 && github\.event\.pull_request\.head\.sha == 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' && github\.run_attempt == 1 \}\}/);
  assert.doesNotMatch(source, /workflow_dispatch|workflow_run|pull_request:\s|branches:\s*\[main\]|secrets:\s*inherit/);
});

test('caller retains the existing strict self classifier verbatim', async () => {
  const self = await readFile(new URL('../.github/workflows/self-architecture-gate.yml', import.meta.url), 'utf8');
  const classifier = text => {
    const begin = text.indexOf('      - name: Classify trusted base and head repository IDs');
    const end = text.indexOf('\n\n  ', begin);
    assert.ok(begin >= 0 && end > begin);
    return text.slice(begin, end);
  };
  assert.equal(classifier(source), classifier(self));
});

test('mutated caller fixtures that widen activation, selectors, credentials, or triggers fail the staged invariant', () => {
  for (const mutate of [
    c => { c.jobs['architecture-gate']['if'] = true; },
    c => { delete c.jobs['architecture-gate']['if']; },
    c => { c.on.pull_request_target.branches.push('main'); },
    c => { c.on.pull_request_target.types.push('synchronize'); },
    c => { c.jobs['architecture-gate'].uses = c.jobs['architecture-gate'].uses.replace(/@.*/, '@main'); },
    c => { c.jobs['architecture-gate'].with['prompt-path'] = '.codex/candidate-prompt.md'; },
    c => { c.jobs['architecture-gate'].secrets.OPENAI_API_KEY = '${{ secrets.OPENAI_API_KEY }}'; },
    c => { c.on.workflow_dispatch = {}; },
  ]) {
    const fixture = structuredClone(workflow);
    mutate(fixture);
    assert.throws(() => assertStaged(fixture));
  }
});


test('copied classifier executes same-repository, fork, and malformed metadata cases', async () => {
  const stepStart = source.indexOf('- name: Classify trusted base and head repository IDs');
  const runStart = source.indexOf('        run: |\n', stepStart);
  assert.ok(stepStart >= 0 && runStart > stepStart);
  const lines = source.slice(runStart + '        run: |\n'.length).split('\n');
  const body = [];
  for (const line of lines) {
    if (line && !line.startsWith('          ')) break;
    body.push(line ? line.slice(10) : '');
  }
  const wrapped = body.join('\n');
  const script = wrapped.match(/^node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE\s*$/)?.[1];
  assert.ok(script);
  const directory = await mkdtemp(join(tmpdir(), 'agk334-caller-classifier-'));
  try {
    const classify = async fixture => {
      const eventPath = join(directory, 'event.json');
      const outputPath = join(directory, 'output');
      await writeFile(eventPath, JSON.stringify(fixture));
      await writeFile(outputPath, '');
      const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], {
        encoding: 'utf8',
        env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: outputPath,
          GITHUB_EVENT_NAME: 'pull_request_target', EXPECTED_REPOSITORY_ID: '123',
          EXPECTED_PULL_REQUEST_NUMBER: '45' },
      });
      assert.equal(result.status, 0, result.stderr);
      return (await readFile(outputPath, 'utf8')).trim();
    };
    const fixture = { repository: { id: 123 }, pull_request: { number: 45,
      base: { sha: 'a'.repeat(40), repo: { id: 123 } },
      head: { sha: 'b'.repeat(40), repo: { id: 123 } } } };
    assert.equal(await classify(fixture), 'classification=same-repository');
    assert.equal(await classify({ ...fixture, pull_request: { ...fixture.pull_request,
      head: { ...fixture.pull_request.head, repo: { id: 456 } } } }), 'classification=cross-repository');
    assert.equal(await classify({ ...fixture, pull_request: { ...fixture.pull_request, number: 46 } }), 'classification=unknown');
    assert.equal(await classify({ ...fixture, repository: { id: '123' } }), 'classification=unknown');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
