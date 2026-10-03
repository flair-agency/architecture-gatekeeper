import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { runGeminiCliProcess } from '../src/gemini-cli-process.mjs';

const base = (mode = 'normal') => {
  const root = mkdtempSync(join(tmpdir(), 'gemini-cli-process-'));
  const privateParentDirectory = join(root, 'private'); mkdirSync(privateParentDirectory);
  const workspaceDirectory = join(root, 'workspace'); mkdirSync(workspaceDirectory);
  const cliEntrypoint = join(root, 'fake-cli.mjs');
  writeFileSync(cliEntrypoint, `
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
const mode = ${JSON.stringify(mode)};
if (process.argv.includes('--version')) {
  if (mode === 'version-hang') { setInterval(() => {}, 1000); }
  else { process.stdout.write(mode === 'wrong-version' ? '0.63.0' : '0.62.0'); process.exit(0); }
}
if (mode === 'early-stdin') process.exit(0);
const promptChunks = []; for await (const chunk of process.stdin) promptChunks.push(chunk);
const prompt = Buffer.concat(promptChunks).toString('utf8');
const settings = JSON.parse(readFileSync(join(process.env.HOME, '.gemini/settings.json'), 'utf8'));
const state = { settings, userSettingsMode: (await import('node:fs')).statSync(join(process.env.HOME, '.gemini/settings.json')).mode & 0o777, systemSettingsPathExists: existsSync(process.env.GEMINI_CLI_SYSTEM_SETTINGS_PATH), systemDefaultsPathExists: existsSync(process.env.GEMINI_CLI_SYSTEM_DEFAULTS_PATH), env: process.env, argv: process.argv.slice(2), prompt, promptSha256: createHash('sha256').update(prompt).digest('hex') };
writeFileSync(join(process.cwd(), 'observed.json'), JSON.stringify(state));
if (mode === 'hang') { setInterval(() => {}, 1000); }
if (mode === 'large') { process.stdout.write('x'.repeat(4096)); setInterval(() => {}, 1000); }
if (mode === 'descendant' || mode === 'inherited-descendant') {
  const code = 'const fs=require("node:fs");const p=process.argv[1];fs.appendFileSync(p,"start");setInterval(()=>fs.appendFileSync(p,"x"),10);';
  const descendant = spawn(process.execPath, ['-e', code, join(process.cwd(), 'heartbeat')], { stdio: mode === 'descendant' ? 'ignore' : 'inherit' });
  descendant.unref();
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
}
if (mode === 'invalid-utf8') { process.stdout.write(Buffer.from([0xff])); process.exit(0); }
if (mode === 'split-utf8') {
  const bytes = Buffer.from(JSON.stringify({ response: '{"decision":"PASS","summary":"🧪"}' }));
  for (const byte of bytes) process.stdout.write(Buffer.from([byte]));
  process.exit(0);
}
process.stdout.write(JSON.stringify({ response: '{"decision":"PASS"}' }));
if (mode === 'descendant' || mode === 'inherited-descendant') setTimeout(() => process.exit(0), 30);
`);
  return { root, privateParentDirectory, workspaceDirectory, cliEntrypoint };
};
const options = fixture => ({ ...fixture, prompt: 'Review safely', model: 'gemini-2.5-flash', thinkingBudget: 1024, project: 'demo-project', region: 'us-central1', proxyUrl: 'http://127.0.0.1:45678/', timeoutMs: 2000, maxPromptBytes: 1024, maxStdoutBytes: 1024, maxStderrBytes: 1024 });

test('uses a fresh private HOME, minimal environment, and fixed CLI arguments', async t => {
  const fixture = base(); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const oldCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const oldNodeOptions = process.env.NODE_OPTIONS;
  process.env.GOOGLE_APPLICATION_CREDENTIALS = '/poison/ambient.json';
  process.env.NODE_OPTIONS = '--require=/poison.js';
  t.after(() => { if (oldCredentials === undefined) delete process.env.GOOGLE_APPLICATION_CREDENTIALS; else process.env.GOOGLE_APPLICATION_CREDENTIALS = oldCredentials; if (oldNodeOptions === undefined) delete process.env.NODE_OPTIONS; else process.env.NODE_OPTIONS = oldNodeOptions; });
  const result = await runGeminiCliProcess({ ...options(fixture), prompt: 'Review 🧪 safely' });
  assert.equal(result.exitCode, 0);
  const seen = JSON.parse((await import('node:fs')).readFileSync(join(fixture.workspaceDirectory, 'observed.json'), 'utf8'));
  assert.deepEqual(seen.argv, ['--model=gemini-2.5-flash', '--output-format', 'json']);
  assert.equal(seen.prompt, 'Review 🧪 safely');
  assert.equal(seen.env.GOOGLE_VERTEX_BASE_URL, 'http://127.0.0.1:45678/');
  assert.equal(seen.env.GOOGLE_GENAI_API_VERSION, 'v1');
  assert.equal(seen.env.GOOGLE_CLOUD_PROJECT, 'demo-project');
  assert.equal(seen.env.GOOGLE_CLOUD_LOCATION, 'us-central1');
  assert.equal(seen.env.GOOGLE_APPLICATION_CREDENTIALS, undefined);
  assert.equal(seen.env.NODE_OPTIONS, undefined);
  assert.deepEqual(seen.settings.tools.core, ['read_file', 'list_directory', 'glob', 'grep_search']);
  assert.equal(seen.settings.telemetry.enabled, false);
  assert.equal(seen.settings.general.enableAutoUpdate, false);
  assert.deepEqual(seen.settings.hooksConfig, { enabled: false });
  assert.deepEqual(seen.settings.skills, { enabled: false });
  assert.equal(seen.userSettingsMode, 0o600);
  assert.equal(seen.systemSettingsPathExists, false);
  assert.equal(seen.systemDefaultsPathExists, false);
  assert.equal(seen.settings.security.auth.selectedType, 'vertex-ai');
  assert.equal(seen.settings.modelConfigs.customOverrides[0].modelConfig.generateContentConfig.thinkingConfig.thinkingBudget, 1024);
  assert.equal(readdirSync(fixture.privateParentDirectory).length, 0);
});

test('rejects workspace and ancestor Gemini operational controls before HOME allocation or CLI spawn', async t => {
  const cases = [
    ['workspace .gemini directory', (f) => mkdirSync(join(f.workspaceDirectory, '.gemini'))],
    ['workspace .agents directory', (f) => mkdirSync(join(f.workspaceDirectory, '.agents'))],
    ['workspace .env', (f) => writeFileSync(join(f.workspaceDirectory, '.env'), 'CONTROL=1')],
    ['workspace GEMINI.md', (f) => writeFileSync(join(f.workspaceDirectory, 'GEMINI.md'), 'instructions')],
    ['ancestor .gemini directory', (f) => mkdirSync(join(f.root, '.gemini'))],
    ['ancestor .agents directory', (f) => mkdirSync(join(f.root, '.agents'))],
    ['ancestor .env', (f) => writeFileSync(join(f.root, '.env'), 'CONTROL=1')],
    ['ancestor GEMINI.md', (f) => writeFileSync(join(f.root, 'GEMINI.md'), 'instructions')],
    ['dangling workspace control symlink', (f) => symlinkSync(join(f.root, 'missing'), join(f.workspaceDirectory, '.env'))],
    ['dangling ancestor control symlink', (f) => symlinkSync(join(f.root, 'missing'), join(f.root, 'GEMINI.md'))],
  ];
  for (const [label, createControl] of cases) {
    const fixture = base();
    t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
    createControl(fixture);
    await assert.rejects(runGeminiCliProcess(options(fixture)), /forbidden control path/, label);
    assert.equal(readdirSync(fixture.privateParentDirectory).length, 0, `${label}: no private HOME allocated`);
    assert.equal(existsSync(join(fixture.workspaceDirectory, 'observed.json')), false, `${label}: CLI not spawned`);
  }
});

test('rejects a mismatched CLI version and removes its private HOME', async t => {
  const fixture = base('wrong-version'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  await assert.rejects(runGeminiCliProcess(options(fixture)), /pinned version/);
  assert.equal(readdirSync(fixture.privateParentDirectory).length, 0);
});

test('fails closed on deadlines, abort, output overflow, and missing explicit bounds', async t => {
  const fixture = base('version-hang'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  await assert.rejects(runGeminiCliProcess({ ...options(fixture), timeoutMs: 1000 }), /version probe failed/);
  assert.equal(readdirSync(fixture.privateParentDirectory).length, 0);
  const timed = base('hang'); t.after(() => rmSync(timed.root, { recursive: true, force: true }));
  const timedResult = await runGeminiCliProcess({ ...options(timed), timeoutMs: 1000 });
  assert.equal(timedResult.timedOut, true);
  assert.equal(readdirSync(timed.privateParentDirectory).length, 0);
  const hanging = base('hang'); t.after(() => rmSync(hanging.root, { recursive: true, force: true }));
  const controller = new AbortController();
  const active = runGeminiCliProcess({ ...options(hanging), timeoutMs: 5000, signal: controller.signal });
  for (let attempt = 0; attempt < 500 && !existsSync(join(hanging.workspaceDirectory, 'observed.json')); attempt++) await delay(10);
  assert.equal(existsSync(join(hanging.workspaceDirectory, 'observed.json')), true);
  controller.abort();
  assert.equal((await active).cancelled, true);
  assert.equal(readdirSync(hanging.privateParentDirectory).length, 0);
  const alreadyAborted = new AbortController(); alreadyAborted.abort();
  await assert.rejects(runGeminiCliProcess({ ...options(hanging), signal: alreadyAborted.signal }), /cancelled/);
  await assert.rejects(runGeminiCliProcess({ ...options(fixture), maxStdoutBytes: undefined }), /explicit positive/);
  await assert.rejects(runGeminiCliProcess({ ...options(fixture), prompt: 'x'.repeat(1025) }), /exceeds its configured byte limit/);
  await assert.rejects(runGeminiCliProcess({ ...options(fixture), maxPromptBytes: 8 * 1024 * 1024 + 1 }), /stdin limit/);
  await assert.rejects(runGeminiCliProcess({ ...options(fixture), prompt: '\ud800' }), /invalid UTF-8/);
});

test('kills the process group and rejects output as soon as a byte ceiling is crossed', async t => {
  const fixture = base('large'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  await assert.rejects(runGeminiCliProcess({ ...options(fixture), maxStdoutBytes: 128 }), /size limit/);
  assert.equal(readdirSync(fixture.privateParentDirectory).length, 0);
});

test('kills a leftover descendant after successful CLI exit', async t => {
  const fixture = base('descendant'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const result = await runGeminiCliProcess(options(fixture));
  assert.equal(result.exitCode, 0);
  for (let attempt = 0; attempt < 40 && !existsSync(join(fixture.workspaceDirectory, 'heartbeat')); attempt++) await delay(10);
  assert.equal(existsSync(join(fixture.workspaceDirectory, 'heartbeat')), true);
  const before = statSync(join(fixture.workspaceDirectory, 'heartbeat')).size;
  await delay(100);
  assert.equal(statSync(join(fixture.workspaceDirectory, 'heartbeat')).size, before);
});

test('overall timeout catches a successful main exit whose descendant keeps output pipes open', async t => {
  const fixture = base('inherited-descendant'); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const result = await runGeminiCliProcess({ ...options(fixture), timeoutMs: 1500 });
  assert.equal(result.timedOut, true);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /"response"/);
});

test('keeps prompt-leading CLI options on stdin and handles UTF-8 strictly', async t => {
  const fixture = base(); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const prompt = '--yolo --include-directories=/tmp';
  const result = await runGeminiCliProcess({ ...options(fixture), prompt });
  assert.equal(result.exitCode, 0);
  const seen = JSON.parse((await import('node:fs')).readFileSync(join(fixture.workspaceDirectory, 'observed.json'), 'utf8'));
  assert.equal(seen.prompt, prompt);
  assert.deepEqual(seen.argv, ['--model=gemini-2.5-flash', '--output-format', 'json']);
  const split = base('split-utf8'); t.after(() => rmSync(split.root, { recursive: true, force: true }));
  assert.match((await runGeminiCliProcess(options(split))).stdout, /🧪/);
  const invalid = base('invalid-utf8'); t.after(() => rmSync(invalid.root, { recursive: true, force: true }));
  await assert.rejects(runGeminiCliProcess(options(invalid)), /not valid UTF-8/);
});

test('delivers a 512 KiB prompt in full and rejects early stdin closure', async t => {
  const fixture = base(); t.after(() => rmSync(fixture.root, { recursive: true, force: true }));
  const prompt = 'p'.repeat(512 * 1024 - 4) + '🧪';
  const result = await runGeminiCliProcess({ ...options(fixture), prompt, maxPromptBytes: 600 * 1024 });
  assert.equal(result.exitCode, 0);
  const seen = JSON.parse((await import('node:fs')).readFileSync(join(fixture.workspaceDirectory, 'observed.json'), 'utf8'));
  assert.equal(Buffer.byteLength(seen.prompt, 'utf8'), 512 * 1024);
  assert.equal(seen.promptSha256, createHash('sha256').update(prompt).digest('hex'));
  const early = base('early-stdin'); t.after(() => rmSync(early.root, { recursive: true, force: true }));
  await assert.rejects(runGeminiCliProcess({ ...options(early), prompt, maxPromptBytes: 600 * 1024 }), /closed prompt stdin/);
});
