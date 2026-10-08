import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const helperSource = fileURLToPath(new URL('../scripts/relocate-protected-runtime.mjs', import.meta.url));
const runtimeName = '.architecture-gatekeeper-runtime';
const validationName = '.architecture-gatekeeper-validation-runtime';
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};

function fixture(t, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agk-runtime-relocation-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'repo', 'repo');
  mkdirSync(workspace, { recursive: true });
  const source = join(workspace, options.name ?? runtimeName);
  mkdirSync(join(source, 'scripts'), { recursive: true });
  copyFileSync(helperSource, join(source, 'scripts', 'relocate-protected-runtime.mjs'));
  writeFileSync(join(source, 'package.json'), '{"name":"trusted-runtime-fixture"}\n');
  writeFileSync(join(source, 'tracked.txt'), 'pinned content\n');
  git(source, 'init', '-q');
  git(source, 'config', 'user.name', 'Isolation Test');
  git(source, 'config', 'user.email', 'isolation@example.invalid');
  git(source, 'add', 'package.json', 'tracked.txt', 'scripts/relocate-protected-runtime.mjs');
  git(source, 'commit', '-q', '-m', 'fixture');
  const sha = git(source, 'rev-parse', 'HEAD');
  const output = join(root, 'github-output');
  writeFileSync(output, 'sentinel=preserve\n');
  const runnerTemp = join(root, '_temp');
  mkdirSync(runnerTemp);
  return { root, workspace, source, sha, output, temp: runnerTemp };
}

function run(f, { args = [basename(f.source)], helperPath = join(f.source, 'scripts', 'relocate-protected-runtime.mjs'), ...overrides } = {}) {
  return spawnSync(process.execPath, [helperPath, ...args], {
    cwd: f.workspace,
    encoding: 'utf8',
    env: { ...process.env, GITHUB_WORKSPACE: f.workspace, RUNNER_TEMP: f.temp, EXPECTED_RUNTIME_SHA: f.sha, ...overrides },
  });
}


test('relocator derives and moves the actual clean checkout into fixed hosted temp', t => {
  const f = fixture(t);
  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  assert.equal(existsSync(f.source), false);
  const output = result.stdout;
  assert.match(output, /^root=.+\n$/);
  const moved = output.slice('root='.length).trimEnd();
  assert.equal(dirname(dirname(moved)), realpathSync(f.temp));
  assert.match(dirname(moved).split('/').at(-1), /^gatekeeper-runtime-/);
  assert.equal(lstatSync(join(moved, '.git')).isDirectory(), true);
  assert.equal(git(moved, 'rev-parse', 'HEAD'), f.sha);
  assert.equal(git(moved, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'), '');
  assert.equal(readFileSync(f.output, 'utf8'), 'sentinel=preserve\n');
});

test('relocator rejects dirty, mismatched, symlinked, and misplaced checkouts without publishing stdout', t => {
  const cases = [
    ['dirty tracked file', f => writeFileSync(join(f.source, 'tracked.txt'), 'changed\n')],
    ['untracked file', f => writeFileSync(join(f.source, 'extra.txt'), 'extra\n')],
    ['ignored file', f => { writeFileSync(join(f.source, '.gitignore'), 'ignored.txt\n'); git(f.source, 'add', '.gitignore'); git(f.source, 'commit', '-q', '-m', 'ignore'); f.sha = git(f.source, 'rev-parse', 'HEAD'); writeFileSync(join(f.source, 'ignored.txt'), 'ignored\n'); }],
    ['wrong expected revision', f => { f.wrongSha = 'a'.repeat(40); }],
    ['malformed expected revision', f => { f.wrongSha = 'not-a-sha'; }],
    ['workspace mismatch', f => { f.otherWorkspace = join(f.root, 'other'); mkdirSync(f.otherWorkspace); }],
    ['arbitrary runner temp', f => { f.temp = join(f.root, 'elsewhere'); mkdirSync(f.temp); writeFileSync(join(f.temp, 'sentinel'), 'untouched'); }],
    ['runner temp inside workspace', f => { f.temp = join(f.workspace, 'runner-temp'); mkdirSync(f.temp); }],
    ['newline workspace', f => { f.badWorkspace = `${f.workspace}\n`; }],
    ['newline temp', f => { f.temp = `${f.temp}\n`; }],
    ['symlink runner temp', f => { const link = join(f.root, 'temp-link'); symlinkSync(f.temp, link); f.temp = link; }],
    ['symlink source', f => { const real = join(f.workspace, 'real-runtime'); renameSync(f.source, real); symlinkSync(real, f.source); }],
    ['symlink Git metadata', f => { const external = join(f.root, 'external-git'); renameSync(join(f.source, '.git'), external); symlinkSync(external, join(f.source, '.git')); }],
    ['missing source', f => rmSync(f.source, { recursive: true })],
    ['wrong argv', f => { f.args = [validationName]; }],
    ['unexpected helper location', f => { f.helperPath = helperSource; }],
  ];
  for (const [label, mutate] of cases) {
    const f = fixture(t);
    mutate(f);
    const overrides = {};
    if (f.wrongSha) overrides.EXPECTED_RUNTIME_SHA = f.wrongSha;
    if (f.badWorkspace) overrides.GITHUB_WORKSPACE = f.badWorkspace;
    if (f.otherWorkspace) overrides.GITHUB_WORKSPACE = f.otherWorkspace;
    const result = run(f, { args: f.args ?? [basename(f.source)], helperPath: f.helperPath, ...overrides });
    assert.notEqual(result.status, 0, label);
    assert.equal(result.stdout, '', `${label} publishes no root`);
    assert.equal(readFileSync(f.output, 'utf8'), 'sentinel=preserve\n', `${label} leaves alternate output untouched`);
    if (existsSync(f.temp) && f.temp.includes('elsewhere')) assert.equal(readFileSync(join(f.temp, 'sentinel'), 'utf8'), 'untouched');
  }
});

test('actual relocation prevents npm lifecycle node and candidate npmrc interception', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agk-npm-isolation-')));
  try {
    const workspace = join(root, 'repo', 'repo');
    const candidateBin = join(workspace, 'node_modules', '.bin');
    const runtime = join(workspace, runtimeName);
    mkdirSync(candidateBin, { recursive: true });
    mkdirSync(join(runtime, 'scripts'), { recursive: true });
    const marker = join(root, 'sentinel.log');
    const nodeSentinel = join(candidateBin, 'node');
    writeFileSync(nodeSentinel, `#!/bin/sh\nprintf 'node:%s\\n' "$*" >> '${marker}'\nexit 73\n`);
    chmodSync(nodeSentinel, 0o755);
    const shellSentinel = join(workspace, 'sentinel-shell');
    writeFileSync(join(runtime, 'package.json'), JSON.stringify({ scripts: { build: 'node clean-dist.mjs && tsc' } }));
    writeFileSync(join(runtime, 'clean-dist.mjs'), "import fs from 'node:fs'; fs.writeFileSync('cleanup-ran', 'yes');\n");
    copyFileSync(helperSource, join(runtime, 'scripts/relocate-protected-runtime.mjs'));
    git(runtime, 'init', '-q');
    git(runtime, 'config', 'user.name', 'npm Isolation Test');
    git(runtime, 'config', 'user.email', 'npm-isolation@example.invalid');
    git(runtime, 'add', 'package.json', 'clean-dist.mjs', 'scripts/relocate-protected-runtime.mjs');
    git(runtime, 'commit', '-q', '-m', 'pinned runtime fixture');
    const sha = git(runtime, 'rev-parse', 'HEAD');
    const npmCli = resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
    const runNpm = cwd => spawnSync(process.execPath, [npmCli, 'run', 'build'], { cwd, encoding: 'utf8', env: { ...process.env, PATH: `/usr/bin:/bin:${dirname(process.execPath)}` } });
    const vulnerable = runNpm(runtime);
    assert.equal(vulnerable.status, 73, vulnerable.stderr);
    assert.match(readFileSync(marker, 'utf8'), /node:clean-dist\.mjs/);
    rmSync(marker);
    const temp = join(root, '_temp');
    mkdirSync(temp);
    const relocated = spawnSync(process.execPath, [join(runtime, 'scripts/relocate-protected-runtime.mjs'), runtimeName], {
      cwd: workspace, encoding: 'utf8',
      env: { ...process.env, GITHUB_WORKSPACE: workspace, RUNNER_TEMP: temp, EXPECTED_RUNTIME_SHA: sha },
    });
    assert.equal(relocated.status, 0, relocated.stderr);
    const externalRuntime = relocated.stdout.slice('root='.length).trimEnd();
    assert.equal(dirname(dirname(externalRuntime)), realpathSync(temp));
    const tsc = join(externalRuntime, 'node_modules', '.bin', 'tsc');
    mkdirSync(dirname(tsc), { recursive: true });
    writeFileSync(tsc, '#!/usr/bin/env node\nprocess.stdout.write("trusted-tsc-ran\\n");\n');
    chmodSync(tsc, 0o755);
    writeFileSync(shellSentinel, `#!/bin/sh\nprintf 'shell:%s\\n' "$*" >> '${marker}'\nexit 74\n`);
    chmodSync(shellSentinel, 0o755);
    writeFileSync(join(workspace, '.npmrc'), `script-shell=${shellSentinel}\n`);
    const npmResult = runNpm(externalRuntime);
    assert.equal(npmResult.status, 0, npmResult.stderr);
    assert.equal(readFileSync(join(externalRuntime, 'cleanup-ran'), 'utf8'), 'yes');
    assert.match(npmResult.stdout, /trusted-tsc-ran/);
    assert.equal(existsSync(marker), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
