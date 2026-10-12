import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readWorkflow, namedStep, hasNeeds } from './helpers/workflow-structure.mjs';

const { source, workflow } = readWorkflow('../../.github/workflows/issue329-codex-pass-handoff-fixture.yml');

test('synthetic handoff fixture is confined to its one repository, branch, and workflow path', () => {
  assert.deepEqual(Object.keys(workflow.on), ['push']);
  assert.deepEqual(workflow.on.push.branches, ['codex/issue329-codex-pass-handoff-fixture']);
  assert.deepEqual(workflow.on.push.paths, ['.github/workflows/issue329-codex-pass-handoff-fixture.yml']);
  assert.deepEqual(Object.keys(workflow.jobs).sort(), ['producer', 'reporter']);
  for (const item of Object.values(workflow.jobs)) {
    assert.match(item.if, /github\.repository == 'flair-agency\/architecture-gatekeeper'/);
    assert.match(item.if, /github\.ref == 'refs\/heads\/codex\/issue329-codex-pass-handoff-fixture'/);
    assert.match(item.if, /github\.event_name == 'push'/);
    assert.ok(item['timeout-minutes'] <= 8);
  }
  assert.deepEqual(workflow.jobs.producer.permissions, { contents: 'read' });
  assert.deepEqual(workflow.jobs.reporter.permissions, { contents: 'read', actions: 'read' });
  assert.ok(hasNeeds(workflow.jobs.reporter, 'producer'));
  assert.deepEqual(workflow.permissions, {});
});

test('producer validates the real consumer inputs before emitting only a masked display', () => {
  const producer = workflow.jobs.producer;
  const validation = namedStep(producer, 'Validate synthetic PASS against the original consumer contract');
  const publication = namedStep(producer, 'Publish validated ordinary Codex PASS display');
  assert.match(validation.run, /validateCodexPass/);
  assert.match(validation.run, /ci-decision\.schema\.json/);
  assert.match(validation.run, /decision\.validation\.json/);
  assert.match(validation.run, /authorities\.json/);
  assert.match(publication.run, /::add-mask::/);
  assert.match(publication.run, /emitPassDisplay/);
  assert.deepEqual(Object.keys(producer.outputs), ['expected']);
  assert.equal(producer.outputs.expected, '${{ steps.validate.outputs.expected }}');
});

test('reporter retrieves the completed same-run log, renders masked data, and preserves G0 fail-closed checks', () => {
  const reporter = workflow.jobs.reporter;
  const step = namedStep(reporter, 'Retrieve masked display and verify the original acceptance boundary');
  assert.match(step.run, /retrievePassDisplay/);
  assert.match(step.run, /renderReport/);
  assert.match(step.run, /assertEnforcedAcceptance/);
  assert.match(step.run, /ownerAmendmentSelected: 'G0'/);
  assert.match(step.run, /\['true', undefined\]/);
  assert.match(step.env.EXPECTED_JSON, /needs\.producer\.outputs\.expected/);
});

test('fixture contains no provider credentials, artifact transfer, writable permissions, or publication action', () => {
  assert.doesNotMatch(source, /\$\{\{\s*secrets\./);
  assert.doesNotMatch(source, /upload-artifact|download-artifact|id-token\s*:|pull-requests\s*:\s*write|openai\/codex-action|OPENAI_API_KEY|GEMINI_API_KEY|GOOGLE_APPLICATION_CREDENTIALS/i);
});

test('both hosted trigger guards accept the exact synthetic push and reject missing or mismatched event identity', () => {
  const workflowPath = '.github/workflows/issue329-codex-pass-handoff-fixture.yml';
  const repository = 'flair-agency/architecture-gatekeeper';
  const branch = 'refs/heads/codex/issue329-codex-pass-handoff-fixture';
  const root = mkdtempSync(join(tmpdir(), 'issue329-fixture-guard-'));
  const git = (cwd, args) => execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 10_000 }).trim();
  const makeRepo = (directory, changedPath) => {
    mkdirSync(directory, { recursive: true });
    git(directory, ['init', '--quiet', '--initial-branch=main']);
    git(directory, ['config', 'user.name', 'Synthetic fixture']);
    git(directory, ['config', 'user.email', 'fixture@example.invalid']);
    writeFileSync(join(directory, 'README.md'), 'base\n');
    git(directory, ['add', 'README.md']);
    git(directory, ['commit', '--quiet', '-m', 'base']);
    const before = git(directory, ['rev-parse', 'HEAD']);
    if (changedPath === workflowPath) {
      const file = join(directory, workflowPath);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, 'name: synthetic fixture\n');
    } else writeFileSync(join(directory, 'README.md'), 'base\nunrelated change\n');
    git(directory, ['add', '--all']);
    git(directory, ['commit', '--quiet', '-m', 'fixture change']);
    return { before, after: git(directory, ['rev-parse', 'HEAD']), eventPath: join(directory, 'event.json') };
  };
  const exactRepo = join(root, 'exact');
  const exact = makeRepo(exactRepo, workflowPath);
  const unrelated = makeRepo(join(root, 'unrelated'), 'README.md');
  const getScript = jobName => {
    const item = workflow.jobs[jobName];
    assert.equal(item.steps[0].uses, 'actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd');
    assert.equal(item.steps[0].with['fetch-depth'], 2);
    assert.equal(item.steps[0].with['persist-credentials'], false);
    const run = namedStep(item, 'Enforce exact synthetic fixture trigger').run;
    assert.equal(item.steps.indexOf(namedStep(item, 'Enforce exact synthetic fixture trigger')), 1);
    const match = run.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/);
    assert.ok(match, `${jobName} trigger guard must run its Node check`);
    return match[1];
  };
  const execute = (script, repo, fixture, overrides = {}) => {
    const eventPath = fixture.eventPath;
    if (eventPath && overrides.event !== undefined) writeFileSync(eventPath, JSON.stringify(overrides.event));
    else if (eventPath) writeFileSync(eventPath, JSON.stringify({ before: fixture.before, after: fixture.after }));
    const env = { GITHUB_EVENT_PATH: eventPath, GITHUB_SHA: fixture.after, REPOSITORY: repository,
      REF: branch, EVENT_NAME: 'push', ...overrides.env };
    const body = script.replace(/^import \{ readFileSync \} from 'node:fs';\nimport \{ execFileSync \} from 'node:child_process';\n/, '');
    const exit = { code: 0 };
    const processStub = { env, exit: code => { exit.code = code; throw exit; } };
    const runGit = (command, args, options) => execFileSync(command, args, { ...options, cwd: repo });
    try { new Function('process', 'readFileSync', 'execFileSync', 'console', body)(processStub, readFileSync, runGit, { error() {} }); return 0; }
    catch (error) { return error === exit ? exit.code : 1; }
  };
  try {
    for (const jobName of ['producer', 'reporter']) {
      const script = getScript(jobName);
      assert.equal(execute(script, exactRepo, exact), 0, `${jobName} should accept the exact workflow-only commit`);
      assert.notEqual(execute(script, join(root, 'unrelated'), unrelated), 0,
        `${jobName} should reject a commit that changes only an unrelated file`);
      assert.notEqual(execute(script, exactRepo, exact, { env: { GITHUB_SHA: exact.before } }), 0,
        `${jobName} should reject a head mismatch`);
      assert.notEqual(execute(script, exactRepo, exact, { env: { REF: 'refs/heads/other-branch' } }), 0,
        `${jobName} should reject a different branch`);
      assert.notEqual(execute(script, exactRepo, exact, { env: { GITHUB_EVENT_PATH: undefined } }), 0,
        `${jobName} should reject a missing event path`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
