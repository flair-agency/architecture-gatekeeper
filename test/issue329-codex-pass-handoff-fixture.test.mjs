import test from 'node:test';
import assert from 'node:assert/strict';
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
  const validEvent = { head_commit: { added: [workflowPath], modified: [], removed: [] } };
  const getScript = jobName => {
    const run = namedStep(workflow.jobs[jobName], 'Enforce exact synthetic fixture trigger').run;
    const match = run.match(/node --input-type=module <<'NODE'\n([\s\S]*?)\nNODE/);
    assert.ok(match, `${jobName} trigger guard must run its Node check`);
    return match[1];
  };
  const execute = (script, { event = validEvent, eventPathValue = '/runner/event.json', ...identity } = {}) => {
    const env = { GITHUB_EVENT_PATH: eventPathValue, REPOSITORY: repository, REF: branch, EVENT_NAME: 'push', ...identity };
    const body = script.replace(/^import \{ readFileSync \} from 'node:fs';\n/, '');
    const exit = { code: 0 };
    const processStub = { env, exit: code => { exit.code = code; throw exit; } };
    const readFile = path => {
      if (!eventPathValue || path !== eventPathValue || event === undefined) throw new Error('missing synthetic event');
      return JSON.stringify(event);
    };
    try { new Function('process', 'readFileSync', 'console', body)(processStub, readFile, { error() {} }); return 0; }
    catch (error) { return error === exit ? exit.code : 1; }
  };
  for (const jobName of ['producer', 'reporter']) {
    const script = getScript(jobName);
    assert.equal(execute(script), 0, `${jobName} should accept the exact changed workflow path`);
    assert.notEqual(execute(script, { event: { head_commit: { added: [], modified: [], removed: [] } } }), 0,
      `${jobName} should reject a push that omits the fixture workflow`);
    assert.notEqual(execute(script, { event: { head_commit: { added: ['.github/workflows/other.yml'], modified: [], removed: [] } } }), 0,
      `${jobName} should reject a different workflow path`);
    assert.notEqual(execute(script, { REF: 'refs/heads/other-branch' }), 0,
      `${jobName} should reject a different branch`);
    assert.notEqual(execute(script, { eventPathValue: null }), 0,
      `${jobName} should reject a missing event path`);
  }
});
