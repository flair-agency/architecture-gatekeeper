import test from 'node:test';
import assert from 'node:assert/strict';
import { appendFileSync, chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { runPostToolScreenHook } from '../src/local-gate.mjs';

function git(root, ...args) { return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim(); }

function fixture(t) {
  const parent = mkdtempSync(join(tmpdir(), 'post-tool-screen-'));
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'repo');
  mkdirSync(join(root, '.codex', 'gatekeeper'), { recursive: true });
  writeFileSync(join(root, 'AGENTS.md'), '# Test authority\n');
  writeFileSync(join(root, 'candidate.md'), 'base\n');
  writeFileSync(join(root, 'staged.md'), 'staged base\n');
  writeFileSync(join(root, '.codex', 'gatekeeper', 'prompt.md'), 'Review the configured authority.\n');
  writeFileSync(join(root, '.codex', 'gatekeeper', 'schema.json'), JSON.stringify({ type: 'object' }));
  writeFileSync(join(root, '.codex', 'gatekeeper', 'reviewer.json'), JSON.stringify({ model: 'test-model', reasoningEffort: 'low' }));
  writeFileSync(join(root, '.codex', 'gatekeeper', 'config.json'), JSON.stringify({
    version: 1,
    authorityFiles: ['AGENTS.md'],
    requiredReportedAuthorityFiles: ['AGENTS.md'],
    requiredPassArrays: ['reviewedScope'],
    promptPath: '.codex/gatekeeper/prompt.md',
    schemaPath: '.codex/gatekeeper/schema.json',
    reviewerConfigPath: '.codex/gatekeeper/reviewer.json',
    reviewTimeoutMs: 5000
  }));
  git(root, 'init');
  git(root, 'config', 'user.name', 'Test');
  git(root, 'config', 'user.email', 'test@example.invalid');
  git(root, 'config', 'commit.gpgSign', 'false');
  git(root, 'add', '.');
  git(root, 'commit', '-m', 'fixture');
  return root;
}

function event(root, changes = {}) {
  return {
    hook_event_name: 'PostToolUse', cwd: root, session_id: 'session-a', turn_id: 'turn-a',
    tool_name: 'Edit', tool_use_id: 'call-a', tool_input: { file_path: 'candidate.md' }, ...changes
  };
}

const pass = request => ({ decision: 'PASS', summary: 'bounded finding', authorityFiles: ['AGENTS.md'], reviewedScope: [request.task.slice(0, 30)] });

test('screens tracked candidate bytes and deduplicates regardless of event-specific metadata', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'staged.md'), 'staged tracked content\n');
  git(root, 'add', 'staged.md');
  writeFileSync(join(root, 'candidate.md'), 'unstaged tracked content\n');
  const requests = [];
  const first = await runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: request => { requests.push(request); return pass(request); } });
  assert.equal(first.result.status, 'PASS');
  assert.match(requests[0].task, /staged tracked content/);
  assert.match(requests[0].task, /unstaged tracked content/);
  assert.equal(requests[0].task.includes('call-a'), false);
  assert.equal(Buffer.byteLength(first.output) <= 4000, true);
  const parsed = JSON.parse(first.output);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  assert.equal('decision' in parsed, false);
  assert.equal('continue' in parsed, false);
  assert.match(parsed.hookSpecificOutput.additionalContext, /"status":"PASS"/);

  const second = await runPostToolScreenHook(event(root, { session_id: 'session-b', turn_id: 'turn-b', tool_name: 'Bash', tool_use_id: 'call-b' }), {
    batchDelayMs: 0, reviewer: request => { requests.push(request); return pass(request); }
  });
  assert.equal(second.result.status, 'unchanged');
  assert.equal(requests.length, 1);
  writeFileSync(join(root, '.codex', 'gatekeeper', 'reviewer.json'), JSON.stringify({ model: 'test-model', reasoningEffort: 'medium' }));
  git(root, 'add', '.codex/gatekeeper/reviewer.json');
  git(root, 'commit', '-m', 'change committed reviewer settings');
  const settingsChanged = await runPostToolScreenHook(event(root, { tool_use_id: 'settings-change' }), {
    batchDelayMs: 0, reviewer: request => { requests.push(request); assert.equal(request.reviewer.reasoningEffort, 'medium'); return pass(request); }
  });
  assert.equal(settingsChanged.result.status, 'PASS');
  assert.equal(requests.length, 2);
});

test('unsupported and oversized candidates are incomplete without calling reviewer', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'untracked.txt'), 'new\n');
  let calls = 0;
  const untracked = await runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: () => { calls += 1; } });
  assert.equal(untracked.result.status, 'incomplete');
  assert.equal(calls, 0);
  rmSync(join(root, 'untracked.txt'));
  writeFileSync(join(root, 'candidate.md'), 'x'.repeat(70 * 1024));
  const large = await runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: () => { calls += 1; } });
  assert.equal(large.result.status, 'incomplete');
  assert.equal(calls, 0);
});

test('staged gitlink movement is explicitly incomplete', async t => {
  const root = fixture(t);
  const source = join(root, '..', 'submodule-source');
  mkdirSync(source);
  git(source, 'init'); git(source, 'config', 'user.name', 'Test'); git(source, 'config', 'user.email', 'test@example.invalid');
  writeFileSync(join(source, 'sub-file.md'), 'source v1\n'); git(source, 'add', '.'); git(source, 'commit', '-m', 'submodule v1');
  execFileSync('git', ['-c', 'protocol.file.allow=always', 'submodule', 'add', source, 'nested'], { cwd: root, stdio: 'ignore' });
  git(root, 'add', 'nested'); git(root, 'commit', '-m', 'add submodule');
  writeFileSync(join(source, 'sub-file.md'), 'source v2\n'); git(source, 'add', '.'); git(source, 'commit', '-m', 'submodule v2');
  git(root, '-C', 'nested', 'fetch', source, 'HEAD');
  git(root, '-C', 'nested', 'checkout', 'FETCH_HEAD');
  git(root, 'add', 'nested');
  let calls = 0;
  const result = await runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: () => { calls += 1; return {}; } });
  assert.equal(result.result.status, 'incomplete');
  assert.equal(calls, 0);
});

test('one active reviewer records only a latest marker and later eligible event reviews current diff', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'candidate.md'), 'first\n');
  let release;
  let calls = 0;
  const delayed = request => new Promise(resolve => { calls += 1; release = () => resolve(pass(request)); });
  const active = runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: delayed });
  await new Promise(resolve => setImmediate(resolve));
  writeFileSync(join(root, 'candidate.md'), 'latest\n');
  const busy = await runPostToolScreenHook(event(root, { tool_use_id: 'call-during-review' }), { batchDelayMs: 0, reviewer: delayed });
  assert.equal(busy.result.status, 'queued-latest');
  assert.equal(calls, 1);
  release();
  assert.equal((await active).result.status, 'PASS');
  assert.equal(calls, 1, 'active invocation does not perform hidden catch-up');

  const next = await runPostToolScreenHook(event(root, { tool_use_id: 'next-call' }), { batchDelayMs: 0, reviewer: request => { calls += 1; assert.match(request.task, /latest/); return pass(request); } });
  assert.equal(next.result.status, 'PASS');
  assert.equal(calls, 2);
});

test('fixed batching delay cannot be extended by a burst of matching events', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'candidate.md'), 'burst candidate\n');
  const eventCount = { value: 0 };
  let release;
  let enteredAt = null;
  const active = runPostToolScreenHook(event(root), {
    batchDelayMs: 140,
    reviewer: request => new Promise(resolve => { enteredAt = eventCount.value; release = () => resolve(pass(request)); })
  });
  for (let index = 0; index < 8; index += 1) {
    await new Promise(resolve => setTimeout(resolve, 25));
    eventCount.value += 1;
    const busy = await runPostToolScreenHook(event(root, { tool_use_id: `burst-${index}` }), { batchDelayMs: 0, reviewer: () => assert.fail('busy event launched a second reviewer') });
    assert.equal(busy.result.status, 'queued-latest');
  }
  assert.notEqual(enteredAt, null);
  assert.ok(enteredAt < 8, 'review started while the burst was still arriving');
  release();
  assert.equal((await active).result.status, 'PASS');
});

test('separate processes share a single-flight reviewer lock', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'candidate.md'), 'multiprocess candidate\n');
  const callsPath = join(root, 'reviewer-calls.txt');
  const moduleUrl = new URL('../src/local-gate.mjs', import.meta.url).href;
  const script = `import { appendFileSync } from 'node:fs'; import { runPostToolScreenHook } from ${JSON.stringify(moduleUrl)}; const request = await runPostToolScreenHook(JSON.parse(process.env.EVENT_JSON), { batchDelayMs: 0, reviewer: request => new Promise(resolve => { appendFileSync(process.env.CALLS_PATH, 'x'); setTimeout(() => resolve({ decision: 'PASS', summary: 'child', authorityFiles: ['AGENTS.md'], reviewedScope: ['child'] }), 350); }) }); process.stdout.write(JSON.stringify(request));`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    cwd: root, env: { ...process.env, EVENT_JSON: JSON.stringify(event(root)), CALLS_PATH: callsPath }, encoding: 'utf8'
  });
  let stdout = '';
  child.stdout.setEncoding('utf8'); child.stdout.on('data', chunk => { stdout += chunk; });
  const childDone = new Promise((resolve, reject) => { child.on('error', reject); child.on('close', code => code === 0 ? resolve() : reject(new Error(`child exited ${code}: ${stdout}`))); });
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try { if (readFileSync(callsPath, 'utf8').length) break; } catch { /* reviewer has not started yet */ }
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.equal(readFileSync(callsPath, 'utf8').length, 1, 'child reviewer started');
  const parent = await runPostToolScreenHook(event(root, { tool_use_id: 'parent-process' }), {
    batchDelayMs: 0,
    reviewer: request => { appendFileSync(callsPath, 'x'); return pass(request); }
  });
  assert.equal(parent.result.status, 'queued-latest');
  await childDone;
  assert.equal(JSON.parse(stdout).result.status, 'PASS');
  assert.equal(readFileSync(callsPath, 'utf8'), 'x');
});

test('linked worktrees keep screening state independent', async t => {
  const root = fixture(t);
  const worktree = join(root, '..', 'linked-worktree');
  git(root, 'worktree', 'add', '-b', 'linked-worktree-test', worktree);
  writeFileSync(join(root, 'candidate.md'), 'primary candidate\n');
  writeFileSync(join(worktree, 'candidate.md'), 'linked candidate\n');
  let release;
  let primaryCalls = 0;
  const active = runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: request => new Promise(resolve => { primaryCalls += 1; release = () => resolve(pass(request)); }) });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  let linkedCalls = 0;
  const linked = await runPostToolScreenHook(event(worktree), { batchDelayMs: 0, reviewer: request => { linkedCalls += 1; assert.match(request.task, /linked candidate/); return pass(request); } });
  assert.equal(linked.result.status, 'PASS');
  assert.equal(linkedCalls, 1);
  release();
  assert.equal((await active).result.status, 'PASS');
  assert.equal(primaryCalls, 1);
  const primaryGitDir = git(root, 'rev-parse', '--git-dir');
  const linkedGitDir = git(worktree, 'rev-parse', '--git-dir');
  assert.notEqual(primaryGitDir, linkedGitDir);
});

test('reviewer failures produce informational incomplete output and large summaries stay bounded', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'candidate.md'), 'candidate\n');
  const failed = await runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: () => { throw new Error('reviewer unavailable'); } });
  assert.equal(failed.result.status, 'incomplete');
  const failJson = JSON.parse(failed.output);
  assert.match(failJson.systemMessage, /incomplete/);
  assert.equal('decision' in failJson, false);

  const bounded = await runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: request => ({ ...pass(request), summary: '終'.repeat(6000) }) });
  assert.ok(Buffer.byteLength(bounded.output) <= 4000);
  const bodyText = JSON.parse(bounded.output).hookSpecificOutput.additionalContext;
  assert.match(bodyText, /requestId/);
  assert.match(bodyText, /snapshotSha256/);
  assert.match(bodyText, /reviewedRevision/);
});

test('all semantic outcomes remain informational and serialized byte cap survives escaping', async t => {
  const root = fixture(t);
  for (const decision of ['BLOCK', 'OWNER_DECISION']) {
    writeFileSync(join(root, 'candidate.md'), `candidate ${decision}\n`);
    const outcome = await runPostToolScreenHook(event(root, { tool_use_id: `outcome-${decision}` }), {
      batchDelayMs: 0, reviewer: request => ({ ...pass(request), decision, summary: `quote " slash \\ ${'a'.repeat(8000)}` })
    });
    assert.equal(outcome.result.status, decision);
    assert.ok(Buffer.byteLength(outcome.output) <= 4000);
    const parsed = JSON.parse(outcome.output);
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
    assert.equal('decision' in parsed, false);
    assert.equal('continue' in parsed, false);
    const context = parsed.hookSpecificOutput.additionalContext;
    for (const key of ['requestId', 'snapshotSha256', 'reviewedRevision', 'toolUseId']) assert.match(context, new RegExp(key));
  }
});

test('HEAD movement during review is reported incomplete and malformed semantic output is incomplete', async t => {
  const root = fixture(t);
  writeFileSync(join(root, 'candidate.md'), 'candidate before HEAD movement\n');
  const original = git(root, 'rev-parse', 'HEAD');
  const moved = await runPostToolScreenHook(event(root), {
    batchDelayMs: 0,
    reviewer: request => {
      git(root, 'commit', '--allow-empty', '-m', 'advance during review');
      return pass(request);
    }
  });
  assert.equal(moved.result.status, 'incomplete');
  assert.equal(moved.result.reviewedRevision, original);
  assert.match(JSON.parse(moved.output).systemMessage, /HEAD moved/);

  writeFileSync(join(root, 'candidate.md'), 'new candidate for malformed output\n');
  const malformed = await runPostToolScreenHook(event(root), { batchDelayMs: 0, reviewer: () => ({ decision: 'UNKNOWN' }) });
  assert.equal(malformed.result.status, 'incomplete');
  assert.match(JSON.parse(malformed.output).systemMessage, /incomplete/);
});

test('invalid hook input emits bounded incomplete context', async () => {
  const result = await runPostToolScreenHook('{broken');
  assert.equal(result.result.status, 'incomplete');
  assert.ok(Buffer.byteLength(result.output) <= 4000);
  assert.match(JSON.parse(result.output).systemMessage, /Invalid PostToolUse JSON/);
});
