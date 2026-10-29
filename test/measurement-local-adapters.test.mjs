import test from 'node:test';

import assert from 'node:assert/strict';

import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, realpathSync, readFileSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';

import { tmpdir } from 'node:os';

import { join } from 'node:path';

import { execFileSync, spawnSync } from 'node:child_process';

import { beginMeasurement, loadMeasurementDirectory, redactMeasurement, readMeasurementJson, validateMeasurementRecord, measurementDigest } from '../dist/measurement.mjs';

import { runManualReview, runManualReviewAsync, runHookAsync } from '../dist/local-gate.mjs';

import { readDiagnosticText, resolveDiagnosticPath } from '../dist/diagnostic-path.mjs';

function fixture(t) {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-measurement-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo'); const dir = join(parent, 'records');
  const priorOutput = process.env.GITHUB_OUTPUT;
  const output = join(parent, 'output'); writeFileSync(output, ''); process.env.GITHUB_OUTPUT = output;
  t.after(() => { if (priorOutput === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = priorOutput; });
  mkdirSync(join(root, '.codex/gatekeeper'), { recursive: true }); mkdirSync(dir, { mode: 0o700 });
  const files = { 'AGENTS.md': '# Authority', 'candidate.md': 'initial', '.codex/gatekeeper/prompt.md': 'review', '.codex/gatekeeper/schema.json': '{"type":"object"}',
    '.codex/gatekeeper/reviewer.json': '{"model":"fixture","reasoningEffort":"low"}',
    '.codex/gatekeeper/config.json': JSON.stringify({ version: 1, authorityFiles: ['AGENTS.md'], requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'], promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000 }) };
  for (const [name, value] of Object.entries(files)) writeFileSync(join(root, name), value);
  for (const args of [['init'], ['config','user.name','Test'], ['config','user.email','test@example.invalid'], ['config','commit.gpgSign','false'], ['add','.'], ['commit','-m','fixture']]) execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  return { parent, root, dir, measurement: { directory: dir, changeId: 'change-1' } };
}

const pass = { decision: 'PASS', summary: 'private summary', authorityFiles: ['AGENTS.md'], reviewedScope: ['private scope'], findings: [] };

const block = { ...pass, decision: 'BLOCK', findings: [{ title: 'private finding', details: 'secret details' }] };

test('immutable starts, preparations and terminals; redaction never copies free text', t => {
  const { root, dir, measurement } = fixture(t);
  const a = beginMeasurement({ route: 'manual', cwd: root, ...measurement });
  a.request({ requestId: 'a'.repeat(64), reviewedRevision: 'b'.repeat(40), prompt: 'private task', schema: {}, reviewer: { model: 'private model' } }, { kind: 'proposed-task' });
  a.finish({ decision: block }); a.finish({ decision: pass });
  const data = loadMeasurementDirectory(dir); assert.equal(data.records.length, 3);
  const terminal = data.records.find(r => r.phase === 'terminal'); assert.deepEqual(terminal.decision, block);
  for (const name of readdirSync(dir)) assert.equal(statSync(join(dir, name)).mode & 0o777, 0o600);
  const exported = JSON.stringify(data.records.map(redactMeasurement));
  for (const privateText of ['private', 'secret', 'AGENTS.md', 'change-1', root]) assert.ok(!exported.includes(privateText));
  assert.equal(redactMeasurement(terminal).findingCount, 1);
  const pending = beginMeasurement({ route: 'manual', cwd: root, ...measurement });
  assert.ok(pending.id); assert.equal(loadMeasurementDirectory(dir).records.filter(r => r.phase === 'start').length, 2);
});

test('manual and UserPromptSubmit preserve verdicts when measurement storage is invalid', async t => {
  const { root, dir, measurement } = fixture(t);
  let calls = 0; const reviewer = () => { calls++; return block; };
  const result = await runManualReviewAsync('private proposed task', root, { reviewer, measurement });
  assert.equal(result.decision, 'BLOCK'); assert.equal(calls, 1);
  assert.equal(loadMeasurementDirectory(dir).records.find(r => r.phase === 'terminal').decision.findings[0].details, 'secret details');
  await assert.rejects(runHookAsync(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'private-session', prompt: 'task', cwd: root }), root, { reviewer, measurement }), /Architecture gate BLOCK/);
  assert.equal(loadMeasurementDirectory(dir).records.filter(r => r.route === 'UserPromptSubmit').length, 3);
  const inside = join(root, 'records'); mkdirSync(inside, { mode: 0o700 });
  assert.equal((await runManualReviewAsync('task', root, { reviewer, measurement: { directory: inside } })).decision, 'BLOCK');
  assert.deepEqual(readdirSync(inside), []);
  chmodSync(dir, 0o755);
  assert.equal((await runManualReviewAsync('task', root, { reviewer, measurement })).decision, 'BLOCK');
  assert.equal(calls, 4);
});

test('native process pair retains preparation without inferring host execution or delivery', t => {
  const { root, parent, dir } = fixture(t);
  const request = join(parent, 'request.json'); const decision = join(parent, 'decision.json'); writeFileSync(decision, JSON.stringify(block));
  const cli = new URL('../dist/native-review.mjs', import.meta.url).pathname;
  const env = { ...process.env, AGK_MEASUREMENT_DIR: dir };
  let result = spawnSync(process.execPath, [cli, 'prepare', request, 'task'], { cwd: root, env, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(loadMeasurementDirectory(dir).records.map(r => r.phase).sort(), ['prepared', 'start']);
  result = spawnSync(process.execPath, [cli, 'validate', request, decision], { cwd: root, env, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).decision, 'BLOCK');
  const terminal = loadMeasurementDirectory(dir).records.find(r => r.phase === 'terminal');
  assert.equal(terminal.observation.hostExecution, 'unknown'); assert.equal(terminal.feedback.delivery, 'unknown'); assert.equal(terminal.request.scope.kind, 'proposed-task');
});

test('bounded loading records malformed files as gaps and refuses symbolic links/duplicate JSON', t => {
  const { parent, root, dir } = fixture(t);
  const a = beginMeasurement({ route: 'manual', cwd: root, directory: dir });
  const start = loadMeasurementDirectory(dir).records.find(r => r.phase === 'start');
  assert.throws(() => validateMeasurementRecord({ ...start, attemptId: [a.id] }), /Invalid diagnostic record/);
  writeFileSync(join(dir, `${a.id}.terminal.json`), '{broken');
  assert.equal(loadMeasurementDirectory(dir).gaps, 1);
  const file = join(parent, 'duplicate.json'); writeFileSync(file, '{"version":1,"version":2}');
  assert.throws(() => readMeasurementJson(file), /duplicate/i);
  const link = join(parent, 'link'); symlinkSync(file, link); assert.throws(() => readMeasurementJson(link));
  writeFileSync(file, ' '.repeat(256 * 1024 + 1)); assert.throws(() => readMeasurementJson(file), /Invalid diagnostic/);
  const alias = join(parent, 'alias'); symlinkSync(dir, alias);
  assert.equal(beginMeasurement({ route: 'manual', cwd: root, directory: alias }).id, null);
});

test('Windows capture and directory export fail explicitly without changing manual review', t => {
  const { root, dir } = fixture(t);
  const script = `
    import assert from 'node:assert/strict';
    import { readdirSync } from 'node:fs';
    import { beginMeasurement, loadMeasurementDirectory } from ${JSON.stringify(new URL('../dist/measurement.mjs', import.meta.url).href)};
    import { runManualReviewAsync } from ${JSON.stringify(new URL('../dist/local-gate.mjs', import.meta.url).href)};
    Object.defineProperty(process, 'platform', { value: 'win32' });
    const dir = process.argv[1]; const root = process.argv[2];
    assert.equal(beginMeasurement({ route: 'manual', cwd: root, directory: dir }).id, null);
    assert.throws(() => loadMeasurementDirectory(dir), /unsupported on Windows/);
    const decision = ${JSON.stringify(block)};
    const result = await runManualReviewAsync('task', root, { reviewer: () => decision, measurement: { directory: dir } });
    assert.equal(result.decision, 'BLOCK');
    assert.deepEqual(readdirSync(dir), []);
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script, dir, root], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /diagnostic recording unavailable/);
});

test('export retains only validated collector identity for every phase', t => {
  const { root, dir, measurement } = fixture(t);
  const capture = beginMeasurement({ route: 'manual', cwd: root, ...measurement });
  capture.request({ requestId: 'a'.repeat(64), prompt: 'private task' });
  capture.finish({ decision: pass });
  const records = loadMeasurementDirectory(dir).records;
  const exported = records.map(redactMeasurement);
  for (let i = 0; i < records.length; i++) assert.deepEqual(exported[i].runtime, records[i].runtime);
  assert.equal(new Set(exported.map(r => JSON.stringify(r.runtime))).size, 1);
  const changed = { ...records[0], runtime: { ...records[0].runtime, collectorSha256: 'b'.repeat(64), privateNarrative: 'secret', reviewer: { model: 'private model' } } };
  assert.equal(redactMeasurement(changed).runtime.collectorSha256, 'b'.repeat(64));
  assert.ok(!JSON.stringify(redactMeasurement(changed)).includes('secret'));
  assert.deepEqual(redactMeasurement({ ...records[0], runtime: { package: 'private package', version: 'private version', collectorSha256: 'c'.repeat(40) } }).runtime,
    { package: null, version: null, collectorSha256: null });
  assert.deepEqual(redactMeasurement({ ...records[0], runtime: null }).runtime,
    { package: null, version: null, collectorSha256: null });
});

test('diagnostic readers reject parent aliases, hard links, nonfiles and malformed UTF-8', t => {
  const { parent, dir } = fixture(t);
  const file = join(dir, 'input.json'); writeFileSync(file, '{}');
  const alias = join(parent, 'directory-alias'); symlinkSync(dir, alias);
  assert.throws(() => readMeasurementJson(join(alias, 'input.json')), /parent must be canonical/);
  assert.throws(() => loadMeasurementDirectory(alias), /canonical|private/);
  const hard = join(dir, 'hard.json'); linkSync(file, hard);
  assert.throws(() => readMeasurementJson(hard), /Invalid diagnostic/);
  assert.throws(() => readDiagnosticText(dir, 1024), /Invalid diagnostic/);
  const invalid = join(parent, 'invalid.json'); writeFileSync(invalid, Buffer.from([0xff]));
  assert.throws(() => readMeasurementJson(invalid), /encoded data/i);
});

test('native host-managed paths remain independent of diagnostic path restrictions', t => {
  const { root, parent, dir } = fixture(t);
  const cli = new URL('../dist/native-review.mjs', import.meta.url).pathname;
  const env = { ...process.env, AGK_MEASUREMENT_DIR: dir };
  const alias = join(parent, 'alias'); symlinkSync(root, alias);
  let result = spawnSync(process.execPath, [cli, 'prepare', join(alias, 'request.json'), 'task'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(existsSync(join(root, 'request.json')), true);
  writeFileSync(join(root, 'decision.json'), JSON.stringify(block)); symlinkSync(join(root, 'decision.json'), join(root, 'linked.json'));
  result = spawnSync(process.execPath, [cli, 'validate', 'request.json', 'linked.json'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).decision, 'BLOCK');
  // Relative pairing retains the same host-managed I/O behavior.
  result = spawnSync(process.execPath, [cli, 'prepare', 'request-2.json', 'task'], { cwd: root, env, encoding: 'utf8' }); assert.equal(result.status, 0, result.stderr);
  result = spawnSync(process.execPath, [cli, 'validate', 'request-2.json', 'decision.json'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).decision, 'BLOCK');
});

test('native host allocations outside diagnostic roots work with collection off and on', {
  skip: process.platform !== 'linux' || !existsSync('/dev/shm'),
}, t => {
  const { root, dir } = fixture(t);
  const session = mkdtempSync('/dev/shm/agk-native-host-');
  chmodSync(session, 0o700);
  t.after(() => rmSync(session, { recursive: true, force: true }));
  const cli = new URL('../dist/native-review.mjs', import.meta.url).pathname;
  for (const enabled of [false, true]) {
    const request = join(session, `request-${enabled}.json`);
    const decision = join(session, `decision-${enabled}.json`);
    assert.throws(() => resolveDiagnosticPath(request), /outside host/);
    const env = { ...process.env, AGK_MEASUREMENT_DIR: enabled ? dir : '' };
    let result = spawnSync(process.execPath, [cli, 'prepare', request, 'task'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(statSync(request).mode & 0o777, 0o600);
    writeFileSync(decision, JSON.stringify(block), { mode: 0o600 });
    result = spawnSync(process.execPath, [cli, 'validate', request, decision], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).decision, 'BLOCK');
    assert.equal(loadMeasurementDirectory(dir).records.length, enabled ? 3 : 0);
  }
});

test('retention stops new capture while the full directory remains exportable', t => {
  const { root, dir } = fixture(t);
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory: dir }); attempt.finish({ decision: pass });
  for (let i = readdirSync(dir).length; i < 4096; i++) writeFileSync(join(dir, `unrelated-${i}`), '');
  assert.equal(beginMeasurement({ route: 'manual', cwd: root, directory: dir }).id, null);
  assert.equal(loadMeasurementDirectory(dir).records.length, 2);
});

function dataset() {
  const id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'; const ci = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'; const pending = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
  const base = { version: 1, kind: 'agk-diagnostic', startedAt: '2026-10-01T00:00:00Z', changeId: 'change-1', route: 'manual' };
  const records = [
    { ...base, attemptId: id, phase: 'start' }, { ...base, attemptId: id, phase: 'terminal', completedAt: '2026-10-01T00:00:01Z', state: 'completed', decision: block },
    { ...base, attemptId: ci, route: 'ci-review', phase: 'terminal', completedAt: '2026-10-01T00:00:02Z', state: 'completed', decision: block },
    { ...base, attemptId: pending, changeId: 'change-2', phase: 'start' }];
  const evidence = { adjudicator: 'assessor', initialRef: 'initial snapshot', finalRef: 'final commit', authorityRef: 'authority revision', evidence: ['review notes'] };
  return { version: 1, plan: { window: 'fixed fixture window' }, records,
    population: [1,2,3].map(n => ({ changeId: `change-${n}`, eligible: true, cohort: 'natural', domain: 'self' })),
    cases: [{ ...evidence, caseId: 'defect', changeId: 'change-1', kind: 'architecture-violation', adjudication: 'valid', disposition: 'corrected', resolvedBeforeCI: true, findingRefs: [{ attemptId: id, index: 0 }, { attemptId: ci, index: 0 }] },
      { ...evidence, caseId: 'miss', changeId: 'change-3', kind: 'architecture-violation', adjudication: 'valid', disposition: 'integrated-violation', findingRefs: [] }],
    audits: [{ changeId: 'change-1', blinded: true, auditor: 'independent assessor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', evidence: ['audit'], initialViolationCaseIds: ['defect'], finalViolationCaseIds: [] },
      { changeId: 'change-3', blinded: true, auditor: 'independent assessor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority', evidence: ['audit'], initialViolationCaseIds: ['miss'], finalViolationCaseIds: ['miss'] }] };
}

test('V1 Hook records actual transport prompt including previous context while preserving validation identity', async t => {
  const { root, dir, measurement } = fixture(t); const prompts = [];
  const reviewer = request => { prompts.push(request.prompt); return pass; };
  const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'same', prompt: 'same task', cwd: root });
  await runHookAsync(input, root, { reviewer, measurement }); await runHookAsync(input, root, { reviewer, measurement });
  const { measurementDigest } = await import('../dist/measurement.mjs');
  const terminals = loadMeasurementDirectory(dir).records.filter(r => r.phase === 'terminal');
  assert.notEqual(prompts[0], prompts[1]);
  assert.deepEqual(new Set(terminals.map(r => r.request.promptSha256)), new Set(prompts.map(measurementDigest)));
  assert.equal(new Set(terminals.map(r => r.request.requestId)).size, 1);
});

test('real native prepare retry cannot hide the original unfinished preparation during validation', t => {
  const { root, parent, dir } = fixture(t);
  const cli = new URL('../dist/native-review.mjs', import.meta.url).pathname;
  const requestPath = join(parent, 'native-retry-request.json'); const decisionPath = join(parent, 'native-retry-decision.json');
  const env = { ...process.env, AGK_MEASUREMENT_DIR: dir };
  const first = spawnSync(process.execPath, [cli, 'prepare', requestPath, 'same deterministic task'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(first.status, 0, first.stderr);
  const requestBytes = readFileSync(requestPath); const request = JSON.parse(requestBytes);
  const original = loadMeasurementDirectory(dir).records.find(r => r.phase === 'prepared');
  const retry = spawnSync(process.execPath, [cli, 'prepare', requestPath, 'same deterministic task'], { cwd: root, env, encoding: 'utf8' });
  assert.equal(retry.status, 2); assert.match(retry.stderr, /EEXIST/);
  assert.deepEqual(readFileSync(requestPath), requestBytes);
  const records = loadMeasurementDirectory(dir).records;
  const failedRetry = records.find(r => r.phase === 'terminal' && r.state === 'error');
  assert.ok(failedRetry); assert.notEqual(failedRetry.attemptId, original.attemptId);
  assert.equal(failedRetry.request.requestId, request.requestId);
  assert.ok(failedRetry.startedAt > original.startedAt);
  writeFileSync(decisionPath, JSON.stringify(block));
  const validated = spawnSync(process.execPath, [cli, 'validate', requestPath, decisionPath], { cwd: root, env, encoding: 'utf8' });
  assert.equal(validated.status, 0, validated.stderr); assert.equal(JSON.parse(validated.stdout).decision, 'BLOCK');
  const terminal = loadMeasurementDirectory(dir).records.find(r => r.phase === 'terminal' && r.attemptId === original.attemptId);
  assert.ok(terminal, 'the original unfinished preparation must receive the validation result');
  assert.equal(terminal.state, 'completed'); assert.equal(terminal.decision.decision, 'BLOCK');
});

test('synchronous UserPromptSubmit input failure preserves CLI exit and stderr with capture enabled', t => {
  const { root, dir } = fixture(t);
  const script = `import {runHook} from ${JSON.stringify(new URL('../dist/local-gate.mjs', import.meta.url).href)};runHook('{bad',process.cwd());`;
  const invoke = directory => spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env: { ...process.env, AGK_MEASUREMENT_DIR: directory }, encoding: 'utf8' });
  const disabled = invoke(''); const enabled = invoke(dir);
  assert.equal(disabled.status, 2); assert.equal(enabled.status, 2); assert.equal(enabled.stdout, disabled.stdout); assert.equal(enabled.stderr, disabled.stderr);
  const terminal = loadMeasurementDirectory(dir).records.find(r => r.phase === 'terminal'); assert.equal(terminal.route, 'UserPromptSubmit'); assert.equal(terminal.state, 'error'); assert.equal(terminal.decision, null); assert.equal(terminal.observation.failureStage, 'hook-input');
});

test('manual sync and async APIs cannot accept Hook route/session through caller options', async t => {
  const {root, dir, measurement} = fixture(t); let routeReads = 0; let sessionReads = 0;
  const options = {reviewer: () => pass, measurement,
    get measurementRoute() { routeReads++; return 'UserPromptSubmit'; },
    get measurementSession() { sessionReads++; return 'forged-session'; }};
  assert.equal(runManualReview('task', root, options).decision, 'PASS');
  assert.equal((await runManualReviewAsync('task', root, options)).decision, 'PASS');
  assert.equal(routeReads, 0); assert.equal(sessionReads, 0);
  const records = loadMeasurementDirectory(dir).records; assert.equal(records.length, 6);
  assert.ok(records.every(r => r.route === 'manual' && r.sessionId === null));
  await runHookAsync(JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'actual-hook-session',prompt:'task',cwd:root}),root,options);
  const hook = loadMeasurementDirectory(dir).records.filter(r => r.route === 'UserPromptSubmit');
  assert.equal(hook.length, 3); assert.ok(hook.every(r => r.sessionId === measurementDigest('actual-hook-session')));
  assert.equal(routeReads, 0); assert.equal(sessionReads, 0);
});

for (const firstFailure of ['missing-decision', 'malformed-decision', 'invalid-decision']) {
  test(`native validation retry observes success without rewriting ${firstFailure} terminal`, t => {
    const {root, parent, dir} = fixture(t); const cli = new URL('../dist/native-review.mjs', import.meta.url).pathname;
    const request = join(parent, 'retry-request.json'); const decision = join(parent, 'retry-decision.json');
    const env = {...process.env, AGK_MEASUREMENT_DIR:dir};
    const invoke = (...args) => spawnSync(process.execPath,[cli,...args],{cwd:root,env,encoding:'utf8'});
    const prepared = invoke('prepare',request,'task'); assert.equal(prepared.status,0,prepared.stderr);
    if (firstFailure === 'malformed-decision') writeFileSync(decision,'{broken');
    if (firstFailure === 'invalid-decision') writeFileSync(decision,JSON.stringify({...pass,decision:'INVALID'}));
    const failed = invoke('validate',request,decision); assert.equal(failed.status,2);
    const original = loadMeasurementDirectory(dir).records.find(r=>r.phase==='terminal'); assert.equal(original.state,'error');
    const originalPath = join(dir, `${original.attemptId}.terminal.json`); const originalBytes = readFileSync(originalPath);
    writeFileSync(decision,JSON.stringify(pass)); const retry = invoke('validate',request,decision);
    assert.equal(retry.status,0,retry.stderr); assert.equal(JSON.parse(retry.stdout).decision,'PASS');
    assert.deepEqual(readFileSync(originalPath),originalBytes);
    const records = loadMeasurementDirectory(dir).records; const success = records.find(r=>r.phase==='terminal' && r.state==='completed');
    assert.ok(success); assert.notEqual(success.attemptId,original.attemptId);
    assert.equal(success.request.requestId,JSON.parse(readFileSync(request)).requestId);
    assert.equal(success.observation.hostExecution,'unknown'); assert.equal(success.feedback.delivery,'unknown');
    assert.deepEqual(records.filter(r=>r.attemptId===success.attemptId).map(r=>r.phase).sort(),['prepared','start','terminal']);
  });
}
