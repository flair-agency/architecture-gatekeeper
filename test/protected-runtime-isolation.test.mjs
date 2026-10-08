import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const helper = new URL('../scripts/relocate-protected-runtime.mjs', import.meta.url);
const runtimeName = '.architecture-gatekeeper-runtime';
const git = (cwd, ...args) => {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, `git ${args.join(' ')}: ${result.stderr}`);
  return result.stdout.trim();
};

function fixture(t, options = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agk-runtime-relocation-')));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const workspace = join(root, 'candidate');
  mkdirSync(workspace);
  const source = join(workspace, runtimeName);
  mkdirSync(source);
  writeFileSync(join(source, 'package.json'), '{"name":"trusted-runtime-fixture"}\n');
  writeFileSync(join(source, 'tracked.txt'), 'pinned content\n');
  git(source, 'init', '-q');
  git(source, 'config', 'user.name', 'Isolation Test');
  git(source, 'config', 'user.email', 'isolation@example.invalid');
  git(source, 'add', 'package.json', 'tracked.txt');
  git(source, 'commit', '-q', '-m', 'fixture');
  const sha = git(source, 'rev-parse', 'HEAD');
  const output = join(root, 'github-env');
  writeFileSync(output, '');
  const temp = options.temp ?? join(root, 'runner-temp');
  mkdirSync(temp, { recursive: true });
  return { root, workspace, source, sha, output, temp };
}

function run(f, overrides = {}) {
  return spawnSync(process.execPath, [helper.pathname, runtimeName], {
    cwd: f.workspace,
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_WORKSPACE: f.workspace,
      RUNNER_TEMP: f.temp,
      GITHUB_ENV: f.output,
      EXPECTED_RUNTIME_SHA: f.sha,
      ...overrides,
    },
  });
}

test('relocator moves a clean exact checkout with its Git identity to external runner temp', t => {
  const f = fixture(t);
  const result = run(f);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(f.source), false);
  const moved = readFileSync(f.output, 'utf8').trim().slice('GATEKEEPER_RUNTIME_ROOT='.length);
  assert.equal(dirname(dirname(moved)), realpathSync(f.temp));
  assert.match(dirname(moved).split('/').at(-1), /^gatekeeper-runtime-/);
  assert.equal(lstatSync(join(moved, '.git')).isDirectory(), true);
  assert.equal(git(moved, 'rev-parse', 'HEAD'), f.sha);
  assert.equal(git(moved, 'status', '--porcelain=v1', '--untracked-files=all', '--ignored=matching'), '');
});

test('relocator rejects unsafe checkout and temp conditions without exporting a root', t => {
  const cases = [
    ['dirty tracked file', f => writeFileSync(join(f.source, 'tracked.txt'), 'changed\n')],
    ['untracked file', f => writeFileSync(join(f.source, 'extra.txt'), 'extra\n')],
    ['ignored file', f => { writeFileSync(join(f.source, '.gitignore'), 'ignored.txt\n'); git(f.source, 'add', '.gitignore'); git(f.source, 'commit', '-q', '-m', 'ignore'); f.sha = git(f.source, 'rev-parse', 'HEAD'); writeFileSync(join(f.source, 'ignored.txt'), 'ignored\n'); }],
    ['wrong expected revision', f => { f.wrongSha = 'a'.repeat(40); }],
    ['malformed expected revision', f => { f.wrongSha = 'not-a-sha'; }],
    ['runner temp inside workspace', f => { const child = join(f.workspace, 'runner-temp'); mkdirSync(child); f.temp = child; }],
    ['symlink runner temp', f => { const link = join(f.root, 'temp-link'); symlinkSync(f.temp, link); f.temp = link; }],
    ['symlink source', f => { const real = join(f.workspace, 'real-runtime'); rmSync(f.source, { recursive: true }); mkdirSync(real); symlinkSync(real, f.source); }],
    ['symlink Git metadata', f => { const external = join(f.root, 'external-git'); renameSync(join(f.source, '.git'), external); symlinkSync(external, join(f.source, '.git')); }],
    ['missing source', f => rmSync(f.source, { recursive: true })],
  ];
  for (const [label, mutate] of cases) {
    const f = fixture(t);
    mutate(f);
    const result = run(f, f.wrongSha ? { EXPECTED_RUNTIME_SHA: f.wrongSha } : {});
    assert.notEqual(result.status, 0, label);
    assert.equal(readFileSync(f.output, 'utf8'), '', `${label} exports no root`);
  }
});

test('actual relocation prevents npm lifecycle node and candidate npmrc interception', t => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'agk-npm-isolation-')));
  try {
    const workspace = join(root, 'candidate');
    const candidateBin = join(workspace, 'node_modules', '.bin');
    const runtime = join(workspace, runtimeName);
    mkdirSync(candidateBin, { recursive: true });
    mkdirSync(runtime);
    const marker = join(root, 'sentinel.log');
    const nodeSentinel = join(candidateBin, 'node');
    writeFileSync(nodeSentinel, `#!/bin/sh\nprintf 'node:%s\\n' "$*" >> '${marker}'\nexit 73\n`);
    chmodSync(nodeSentinel, 0o755);
    const shellSentinel = join(workspace, 'sentinel-shell');
    mkdirSync(workspace, { recursive: true });
    writeFileSync(join(runtime, 'package.json'), JSON.stringify({ scripts: { build: 'node clean-dist.mjs && tsc' } }));
    writeFileSync(join(runtime, 'clean-dist.mjs'), "import fs from 'node:fs'; fs.writeFileSync('cleanup-ran', 'yes');\n");
    mkdirSync(join(runtime, 'scripts'));
    copyFileSync(new URL('../scripts/relocate-protected-runtime.mjs', import.meta.url), join(runtime, 'scripts', 'relocate-protected-runtime.mjs'));
    git(runtime, 'init', '-q');
    git(runtime, 'config', 'user.name', 'npm Isolation Test');
    git(runtime, 'config', 'user.email', 'npm-isolation@example.invalid');
    git(runtime, 'add', 'package.json', 'clean-dist.mjs', 'scripts/relocate-protected-runtime.mjs');
    git(runtime, 'commit', '-q', '-m', 'pinned runtime fixture');
    const sha = git(runtime, 'rev-parse', 'HEAD');
    const npmCli = resolve(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js');
    const runNpm = cwd => spawnSync(process.execPath, [npmCli, 'run', 'build'], {
      cwd, encoding: 'utf8', env: { ...process.env, PATH: `/usr/bin:/bin:${dirname(process.execPath)}` },
    });
    const vulnerable = runNpm(runtime);
    assert.equal(vulnerable.status, 73, vulnerable.stderr);
    assert.match(readFileSync(marker, 'utf8'), /node:clean-dist\.mjs/);
    rmSync(marker);
    const runnerTemp = join(root, 'runner-temp');
    mkdirSync(runnerTemp);
    const githubEnv = join(root, 'github-env');
    writeFileSync(githubEnv, '');
    const relocated = spawnSync(process.execPath, [join(runtime, 'scripts/relocate-protected-runtime.mjs'), runtimeName], {
      cwd: workspace,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_WORKSPACE: workspace, RUNNER_TEMP: runnerTemp, GITHUB_ENV: githubEnv, EXPECTED_RUNTIME_SHA: sha },
    });
    assert.equal(relocated.status, 0, relocated.stderr);
    const exportedRoot = readFileSync(githubEnv, 'utf8').trim().slice('GATEKEEPER_RUNTIME_ROOT='.length);
    const externalRuntime = exportedRoot;
    assert.equal(dirname(dirname(externalRuntime)), realpathSync(runnerTemp));
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
