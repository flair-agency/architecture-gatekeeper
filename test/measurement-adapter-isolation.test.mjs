import test from 'node:test';
import { createMeasurementAdapterFixture } from './helpers/measurement-adapter-fixture.mjs';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runHookAsync, runManualReview, runManualReviewAsync } from '../dist/local-gate.mjs';
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

for (const asyncCall of [false,true]) test(`manual result-selection failure retains validated decision (async ${asyncCall})`, async t => {
  const { root, records } = fixture(t); const options = { reviewer: () => decision('PASS'), measurement: { directory: records } };
  Object.defineProperty(options, 'executionReport', { get() { throw new Error('result selection unavailable'); } });
  if (asyncCall) await assert.rejects(runManualReviewAsync('task', root, options), /result selection unavailable/);
  else assert.throws(()=>runManualReview('task',root,options),/result selection unavailable/);
  const terminal = loadMeasurementDirectory(records).records.find(r => r.phase === 'terminal'); assert.equal(terminal.state, 'error'); assert.equal(terminal.feedback.publication, 'unknown'); assert.equal(terminal.decision.decision, 'PASS'); assert.equal(terminal.observation.validation, 'completed'); assert.equal(terminal.observation.failureStage, 'result-selection');
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

for (const route of ['manual-sync', 'manual-async', 'hook']) test(`unavailable warning sink cannot change required adapter result: ${route}`, t => {
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

test('synchronous Hook observes a closed real stdout pipe as unpublished',async t=>{
 const {root,records}=fixture(t);
 const helper=new URL('./helpers/measurement-hook-publication-child.mjs',import.meta.url).pathname;
 const input=JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'closed-pipe',prompt:'task',cwd:root});
 const child=spawn(process.execPath,[helper,input,'pipe'],{cwd:root,env:{...process.env,AGK_MEASUREMENT_DIR:records},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',value=>{stderr+=value;});
 const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>resolve(code));});
 const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);t.after(()=>clearTimeout(timeout));child.stdout.destroy();
 assert.equal(await closed,2,stderr);assert.match(stderr,/EPIPE|broken pipe/i);
 const terminal=loadMeasurementDirectory(records).records.find(r=>r.phase==='terminal');
 assert.equal(terminal.state,'error');assert.equal(terminal.decision.decision,'PASS');assert.equal(terminal.feedback.publication,'unknown');assert.equal(terminal.observation.failureStage,'hook-publication');
});

for (const route of ['manual-sync','manual-async','hook']) test(`validation failure retains observed execution: ${route}`, async t => {
  const {root,records}=fixture(t);writeFileSync(join(root,'candidate.md'),'changed');
  const execution={status:'completed',fixture:'transport-returned'};
  const options={reviewerResultFormat:'envelope',reviewer:()=>({decision:{decision:'invalid'},execution}),measurement:{directory:records}};
  const error=await Promise.resolve().then(()=>route==='manual-sync'?runManualReview('task',root,options):route==='manual-async'?runManualReviewAsync('task',root,options):runHookAsync(JSON.stringify({hook_event_name:'UserPromptSubmit',cwd:root,session_id:'invalid',prompt:'task'}),root,options)).catch(e=>e);
  assert.ok(error instanceof Error);
  const terminal=loadMeasurementDirectory(records).records.find(r=>r.phase==='terminal');
  assert.equal(terminal.decision,null);assert.deepEqual(terminal.execution,execution);
  assert.equal(terminal.observation.execution,'completed');
});
