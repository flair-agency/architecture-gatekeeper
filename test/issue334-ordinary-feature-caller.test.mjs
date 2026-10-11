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
const expectedCondition = "${{ needs.classify-self-repository.outputs.classification == 'same-repository' && github.event_name == 'pull_request_target' && github.event.action == 'ready_for_review' && github.event.pull_request.draft == false && github.event.pull_request.number == 517 && github.event.pull_request.head.sha == 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' && github.run_attempt == 1 }}";

// SYNTHETIC JS expression harness: parses and evaluates this narrow condition grammar locally.
// It is not the GitHub Actions expression engine and does not represent live workflow execution.
function evaluateCondition(expression, context) {
  const match = /^\$\{\{\s*([\s\S]*?)\s*\}\}$/.exec(expression);
  assert.ok(match, 'condition must use a complete GitHub expression');
  const expressionBody = match[1];
  const tokens = expressionBody.match(/\s*(==|&&|\.|'[^']*'|[0-9]+|true|false|[A-Za-z_][A-Za-z0-9_-]*)\s*/gy);
  assert.ok(tokens, 'condition must use the supported expression tokens');
  assert.equal(tokens.join(''), expressionBody, 'condition must be consumed completely by the synthetic parser');
  const normalized = tokens.map(token => token.trim()).filter(Boolean);
  let index = 0;
  const take = token => {
    assert.equal(normalized[index], token, `expected ${token} in condition`);
    index++;
  };
  const value = () => {
    const token = normalized[index++];
    assert.ok(token !== undefined, 'expected value');
    if (token.startsWith("'")) return token.slice(1, -1);
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (/^[0-9]+$/.test(token)) return Number(token);
    const path = [token];
    while (normalized[index] === '.') {
      index++;
      path.push(normalized[index++]);
    }
    return path.reduce((current, key) => current?.[key], context);
  };
  const comparisons = [];
  do {
    const left = value();
    take('==');
    comparisons.push(left === value());
    if (normalized[index] !== '&&') break;
    index++;
  } while (true);
  assert.equal(index, normalized.length, 'condition contains unsupported or trailing syntax');
  return comparisons.every(Boolean);
}

function assertBounded(candidate) {
  assert.deepEqual(candidate.on.pull_request_target, {
    branches: ['feature/gemini-ci'],
    types: ['ready_for_review'],
  });
  assert.deepEqual(Object.keys(candidate.on), ['pull_request_target']);
  assert.deepEqual(candidate.jobs['classify-self-repository'].permissions,
    { contents: 'none', 'id-token': 'none' });
  assert.equal(candidate.jobs['architecture-gate'].if, expectedCondition);
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

test('ordinary Gemini caller has bounded feature context, pin, permissions, and trigger', () => {
  assertBounded(workflow);
  assert.match(source, /Bounded source proposal only[\s\S]*consistency guard, not execution admission/);
  assert.match(source, /types: \[ready_for_review\]/);
  assert.doesNotMatch(source, /workflow_dispatch|workflow_run|pull_request:\s|branches:\s*\[main\]|secrets:\s*inherit/);
});

test('synthetic condition harness admits only the exact selected context', () => {
  const context = {
    needs: { 'classify-self-repository': { outputs: { classification: 'same-repository' } } },
    github: { event_name: 'pull_request_target', event: { action: 'ready_for_review', pull_request: {
      draft: false, number: 517, head: { sha: 'c4b0057d9dd47f79df2a896143f7ac6db5da2c2e' },
    } }, run_attempt: 1 },
  };
  assert.equal(evaluateCondition(workflow.jobs['architecture-gate'].if, context), true);
  const mutate = [
    c => { c.needs['classify-self-repository'].outputs.classification = 'cross-repository'; },
    c => { c.needs['classify-self-repository'].outputs.classification = 'unknown'; },
    c => { c.github.event_name = 'pull_request'; },
    c => { c.github.event.action = 'synchronize'; },
    c => { c.github.event.pull_request.draft = true; },
    c => { delete c.github.event.pull_request.draft; },
    c => { delete c.github.event.action; },
    c => { c.github.event.pull_request.number = 518; },
    c => { c.github.event.pull_request.head.sha = 'd'.repeat(40); },
    c => { delete c.github.event.pull_request.head.sha; },
    c => { c.github.run_attempt = 2; },
  ];
  for (const change of mutate) {
    const negative = structuredClone(context);
    change(negative);
    assert.equal(evaluateCondition(workflow.jobs['architecture-gate'].if, negative), false);
  }
  assert.equal((workflow.jobs['architecture-gate'].if.match(/&&/g) ?? []).length, 6);
  assert.doesNotMatch(workflow.jobs['architecture-gate'].if, /\|\|/);
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
    c => { c.jobs['architecture-gate']['if'] = "${{ github.event_name == 'pull_request_target' }}"; },
    c => { c.jobs['architecture-gate']['if'] = expectedCondition.replace('github.run_attempt == 1', 'github.run_attempt >= 1'); },
    c => { c.on.pull_request_target.branches.push('main'); },
    c => { c.on.pull_request_target.types.push('synchronize'); },
    c => { c.jobs['architecture-gate'].uses = c.jobs['architecture-gate'].uses.replace(/@.*/, '@main'); },
    c => { c.jobs['architecture-gate'].with['prompt-path'] = '.codex/candidate-prompt.md'; },
    c => { c.jobs['architecture-gate'].secrets.OPENAI_API_KEY = '${{ secrets.OPENAI_API_KEY }}'; },
    c => { c.on.workflow_dispatch = {}; },
  ]) {
    const fixture = structuredClone(workflow);
    mutate(fixture);
    assert.throws(() => assertBounded(fixture));
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
