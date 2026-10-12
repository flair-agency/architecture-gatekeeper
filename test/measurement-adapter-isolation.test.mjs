import test from 'node:test';
import { createMeasurementAdapterFixture } from './helpers/measurement-adapter-fixture.mjs';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHookAsync, runManualReview, runManualReviewAsync, runPostToolScreenHook } from '../dist/local-gate.mjs';
import { loadMeasurementDirectory, measurementDigest } from '../dist/measurement.mjs';

function fixture(t) { const value = createMeasurementAdapterFixture(); t.after(value.cleanup); return value; }

const decision = value => ({ decision: value, authorityFiles: ['AGENTS.md'], reviewedScope: ['fixture'], findings: [] });
function badMeasurement() { return Object.defineProperty({}, 'directory', { get() { throw new Error('diagnostic setting unavailable'); } }); }

test('manual reviewer outcomes and errors survive throwing optional measurement selectors', async t => {
  const { root, records } = fixture(t);
  let calls = 0;
  const pass = await runManualReviewAsync('manual task', root, { measurement: badMeasurement(), reviewer: () => { calls++; return decision('PASS'); } });
  assert.equal(pass.decision, 'PASS');
  const block = await runManualReviewAsync('manual task', root, { measurement: badMeasurement(), reviewer: () => { calls++; return decision('BLOCK'); } });
  assert.equal(block.decision, 'BLOCK');
  await assert.rejects(runManualReviewAsync('manual task', root, { measurement: badMeasurement(), reviewer: () => { calls++; throw new Error('reviewer failed'); } }), /reviewer failed/);
  assert.equal(calls, 3);
  assert.deepEqual(loadMeasurementDirectory(records).records, []);

  const ownOptions = {};
  Object.defineProperty(ownOptions, 'reviewer', { enumerable: true, get() {
    if (this !== ownOptions) throw new Error('own reviewer getter receiver changed');
    return () => decision('PASS');
  } });
  assert.equal((await runManualReviewAsync('default-off own getter task', root, ownOptions)).decision, 'PASS');
  Object.defineProperty(ownOptions, 'measurement', { enumerable: true, get() { throw new Error('diagnostic setting unavailable'); } });
  assert.equal((await runManualReviewAsync('own getter task', root, ownOptions)).decision, 'PASS');

  const inheritedPrototype = Object.create(null, { reviewer: { enumerable: true, get() {
    if (this !== inheritedOptions) throw new Error('inherited reviewer getter receiver changed');
    return () => decision('PASS');
  } } });
  const inheritedOptions = Object.create(inheritedPrototype);
  assert.equal((await runManualReviewAsync('default-off inherited getter task', root, inheritedOptions)).decision, 'PASS');
  Object.defineProperty(inheritedOptions, 'measurement', { enumerable: true, get() { throw new Error('diagnostic setting unavailable'); } });
  assert.equal((await runManualReviewAsync('inherited getter task', root, inheritedOptions)).decision, 'PASS');
});

test('UserPromptSubmit and Gemini adapters do not re-read or forward top-level measurement getters', async t => {
  const { root, records } = fixture(t);
  let calls = 0;
  const hookOptions = { reviewer: () => { calls++; return decision('PASS'); } };
  Object.defineProperty(hookOptions, 'measurement', { enumerable: true, get() { throw new Error('measurement getter must be contained'); } });
  const hook = await runHookAsync(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'hook-session', prompt: 'hook task', cwd: root }), root, hookOptions);
  assert.equal(hook.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const enabledHook = await runHookAsync(JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'captured-hook', prompt: 'hook task', cwd: root }), root,
    { measurement: { directory: records }, reviewer: () => { calls++; return decision('PASS'); } });
  assert.equal(enabledHook.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  const capturedTerminal = loadMeasurementDirectory(records).records.find(record => record.route === 'UserPromptSubmit' && record.phase === 'terminal');
  assert.ok(capturedTerminal);
  assert.equal(capturedTerminal.sessionId, measurementDigest('captured-hook'));

  writeFileSync(join(root, '.codex/gatekeeper/reviewer.json'), JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 512 }));
  execFileSync('git', ['add', '.codex/gatekeeper/reviewer.json'], { cwd: root, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'select fixture Gemini reviewer'], { cwd: root, stdio: 'ignore' });
  const geminiOptions = { reviewer: (_request, controls) => { calls++; assert.equal('measurement' in controls, false); return decision('PASS'); } };
  Object.defineProperty(geminiOptions, 'measurement', { enumerable: true, get() { throw new Error('measurement getter must not reach transport spread'); } });
  assert.equal((await runManualReviewAsync('Gemini task', root, geminiOptions)).decision, 'PASS');
  assert.equal(calls, 3);
});

test('PostToolUse stays informational with malformed measurement settings and valid selection records', async t => {
  const { root, records } = fixture(t);
  writeFileSync(join(root, 'candidate.md'), 'changed\n');
  const input = { hook_event_name: 'PostToolUse', cwd: root, session_id: 'session', tool_name: 'Edit' };
  const informational = await runPostToolScreenHook(input, { cwd: root, batchDelayMs: 0, measurement: badMeasurement(), reviewer: () => decision('PASS') });
  assert.equal(informational.result.status, 'PASS');
  assert.equal(JSON.parse(informational.output).hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.match(JSON.parse(informational.output).hookSpecificOutput.additionalContext, /informational/);

  writeFileSync(join(root, 'candidate.md'), 'changed again\n');
  const captured = await runPostToolScreenHook({ ...input, session_id: 'second' }, { cwd: root, batchDelayMs: 0,
    measurement: { directory: records }, reviewer: () => decision('PASS') });
  assert.equal(captured.result.status, 'PASS');
  assert.ok(loadMeasurementDirectory(records).records.some(record => record.route === 'PostToolUse' && record.phase === 'terminal'));
});


for (const kind of ['malformed-json', 'unsupported-event', 'unresolved-repository']) {
  test(`UserPromptSubmit ${kind} retains original error and explicit input gap`, async t => {
    const { root, records } = fixture(t); const outside = join(root, '..', 'not-a-repository'); mkdirSync(outside);
    const input = kind === 'malformed-json' ? '{bad' : JSON.stringify({ hook_event_name: kind === 'unsupported-event' ? 'other' : 'UserPromptSubmit', session_id: 'session', prompt: 'task', cwd: outside });
    const original = await runHookAsync(input, root).catch(error => error);
    let calls = 0;
    const observed = await runHookAsync(input, root, { measurement: { directory: records }, reviewer: () => { calls++; return decision('PASS'); } }).catch(error => error);
    assert.equal(observed.constructor, original.constructor); assert.equal(observed.message, original.message); assert.equal(calls, 0);
    const phases = loadMeasurementDirectory(records).records; assert.deepEqual(phases.map(r => r.phase).sort(), ['start', 'terminal']);
    const terminal = phases.find(r => r.phase === 'terminal'); assert.equal(terminal.route, 'UserPromptSubmit'); assert.equal(terminal.state, 'error'); assert.equal(terminal.decision, null); assert.equal(terminal.request, null); assert.deepEqual(terminal.observation, { failureStage: 'hook-input' });
    const refused = await runHookAsync(input, root, { measurement: badMeasurement() }).catch(error => error); assert.equal(refused.message, original.message);
  });
}


test('Hook context persistence failure preserves rejection and records an unpublished error', async t => {
  const { root, records } = fixture(t); writeFileSync(join(root, '.git/codex-architecture-context'), 'not a directory');
  const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'store-failure', prompt: 'task', cwd: root });
  const options = { reviewer: () => decision('PASS') };
  const original = await runHookAsync(input, root, options).catch(error => error);
  const observed = await runHookAsync(input, root, { ...options, measurement: { directory: records } }).catch(error => error);
  assert.equal(observed.constructor, original.constructor); assert.equal(observed.message, original.message);
  const terminal = loadMeasurementDirectory(records).records.find(r => r.phase === 'terminal');
  assert.equal(terminal.state, 'error'); assert.equal(terminal.decision.decision, 'PASS'); assert.equal(terminal.feedback.publication, 'unknown'); assert.equal(terminal.observation.failureStage, 'hook-context-store');
});

for (const fault of ['context', 'output']) test(`synchronous Hook records the actual outer failure: ${fault}`, t => {
  const { root, records } = fixture(t); if (fault === 'context') writeFileSync(join(root, '.git/codex-architecture-context'), 'not a directory');
  const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'sync-failure', prompt: 'task', cwd: root });
  const helper = new URL('./helpers/measurement-hook-publication-child.mjs', import.meta.url).pathname;
  const invoke = directory => spawnSync(process.execPath, [helper, input, fault], { cwd: root, env: { ...process.env, AGK_MEASUREMENT_DIR: directory }, encoding: 'utf8' });
  const original = invoke(''); const observed = invoke(records); assert.equal(observed.status, original.status); assert.equal(observed.status, 2); assert.equal(observed.stdout, original.stdout); assert.equal(observed.stderr, original.stderr);
  const terminal = loadMeasurementDirectory(records).records.find(r => r.phase === 'terminal'); assert.equal(terminal.state, 'error'); assert.equal(terminal.feedback.publication, 'unknown'); assert.equal(terminal.observation.failureStage, fault === 'context' ? 'hook-context-store' : 'hook-publication');
});

test('successful and blocked Hook publication follows outer behavior', async t => {
  const { root, records } = fixture(t);
  for (const verdict of ['PASS', 'BLOCK']) {
    const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: verdict, prompt: 'task', cwd: root });
    const call = runHookAsync(input, root, { reviewer: () => decision(verdict), measurement: { directory: records } });
    if (verdict === 'PASS') assert.equal((await call).hookSpecificOutput.hookEventName, 'UserPromptSubmit'); else await assert.rejects(call, /Architecture gate BLOCK/);
  }
  const terminals = loadMeasurementDirectory(records).records.filter(r => r.phase === 'terminal');
  for (const terminal of terminals) { assert.equal(terminal.state, 'completed'); assert.equal(terminal.feedback.publication, terminal.decision.decision === 'PASS' ? 'returned-to-caller' : 'unknown'); }
});

test('manual result-selection failure cannot publish an earlier completed terminal', async t => {
  const { root, records } = fixture(t); const options = { reviewer: () => decision('PASS'), measurement: { directory: records } };
  Object.defineProperty(options, 'executionReport', { get() { throw new Error('result selection unavailable'); } });
  await assert.rejects(runManualReviewAsync('task', root, options), /result selection unavailable/);
  const terminal = loadMeasurementDirectory(records).records.find(r => r.phase === 'terminal'); assert.equal(terminal.state, 'error'); assert.equal(terminal.feedback.publication, 'unknown');
});

for (const overflow of [false, true]) test(`PostToolUse CLI output failure records a publication gap (overflow ${overflow})`, t => {
  const { root, records } = fixture(t); const module = new URL('../dist/local-post-tool-screen.mjs', import.meta.url).href;
  const script = `import {runPostToolScreenHookCli} from ${JSON.stringify(module)};const write=process.stdout.write.bind(process.stdout);let calls=0;process.stdout.write=(...args)=>{if(++calls===1)throw new Error('output unavailable');return write(...args)};runPostToolScreenHookCli();`;
  const input = overflow ? 'x'.repeat(256 * 1024 + 1) : JSON.stringify({ hook_event_name: 'unsupported' });
  const invoke = directory => spawnSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, input, env: { ...process.env, AGK_MEASUREMENT_DIR: directory }, encoding: 'utf8' });
  const original = invoke(''); const observed = invoke(records); assert.equal(observed.status, original.status); assert.equal(observed.stdout, original.stdout);
  const terminal = loadMeasurementDirectory(records).records.find(r => r.phase === 'terminal'); assert.equal(terminal.state, 'error'); assert.equal(terminal.feedback.publication, 'unknown'); assert.equal(terminal.observation.failureStage, 'publication');
});

for (const verdict of ['PASS', 'BLOCK']) test(`manual options proxy retains lazy transport reads: ${verdict}`, async t => {
  const { root } = fixture(t); let calls = 0;
  const options = new Proxy({ reviewer() { calls++; return decision(verdict); } }, {
    ownKeys() { throw new Error('options enumeration unavailable'); },
    getOwnPropertyDescriptor() { throw new Error('options descriptors unavailable'); }
  });
  assert.equal(runManualReview('sync proxy task', root, options).decision, verdict);
  assert.equal((await runManualReviewAsync('async proxy task', root, options)).decision, verdict);
  const input = JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: verdict, prompt: 'task', cwd: root });
  // The original Hook composition enumerates caller options; retain that error.
  await assert.rejects(runHookAsync(input, root, options), /options enumeration unavailable/);
  assert.equal(calls, 2);
});

for (const route of ['manual-sync', 'manual-async', 'hook', 'PostToolUse']) test(`unavailable warning sink cannot change required adapter result: ${route}`, t => {
  const child = new URL('./helpers/measurement-adapter-fault-child.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [child, route], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('Hook retains required option-getter failures while manual reads remain lazy', async t => {
 const {root,records}=fixture(t);let calls=0;
 const options={reviewer:()=>{calls++;return decision('PASS');},measurement:{directory:records}};
 Object.defineProperty(options,'unrelated',{enumerable:true,get(){throw new Error('original caller getter failure');}});
 assert.equal((await runManualReviewAsync('task',root,options)).decision,'PASS');
 await assert.rejects(runHookAsync(JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'getter',prompt:'task',cwd:root}),root,options),/original caller getter failure/);
 assert.equal(calls,1);
 const terminal=loadMeasurementDirectory(records).records.find(r=>r.phase==='terminal'&&r.route==='UserPromptSubmit');assert.equal(terminal.state,'error');assert.equal(terminal.feedback.publication,'unknown');
});
