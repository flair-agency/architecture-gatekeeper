import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { closeSync, existsSync, linkSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, join, parse, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const cli = fileURLToPath(new URL('../dist/materialize-regular-git-snapshot.mjs', import.meta.url));
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'materializer-cli-boundary-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const root = join(directory, 'checkout'), outside = join(directory, 'outside');
  mkdirSync(root); mkdirSync(outside);
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', env: {
    ...process.env, GIT_AUTHOR_NAME: 'Test', GIT_AUTHOR_EMAIL: 'test@example.com', GIT_COMMITTER_NAME: 'Test', GIT_COMMITTER_EMAIL: 'test@example.com',
  } }).trim();
  git('init', '-q'); writeFileSync(join(root, 'input.txt'), 'exact snapshot bytes\n'); git('add', '.'); git('commit', '-qm', 'snapshot');
  const commit = git('rev-parse', 'HEAD'), bytes = readFileSync(join(root, 'input.txt'));
  const run = (outputPath, { cwd = root, env = {}, selectedCommit = commit, path = 'input.txt' } = {}) => {
    const environment = { ...process.env, GITHUB_WORKSPACE: root, ...env };
    delete environment.GITHUB_OUTPUT;
    if (environment.GITHUB_WORKSPACE === undefined) delete environment.GITHUB_WORKSPACE;
    return spawnSync(process.execPath, [cli, selectedCommit, path, outputPath], { cwd, env: environment, encoding: 'utf8' });
  };
  const success = (path, options) => { const result = run(path, options); assert.equal(result.error, undefined); assert.equal(result.status, 0, result.stderr); };
  return { directory, root, outside, commit, bytes, run, success };
}

test('CLI output guard retains checkout, runner-temp and outside-cwd relative destinations', t => {
  const f = fixture(t);
  f.success(join(f.root, 'absolute.out')); f.success('relative.out');
  assert.deepEqual(readFileSync(join(f.root, 'absolute.out')), f.bytes);
  assert.deepEqual(readFileSync(join(f.root, 'relative.out')), f.bytes);
  f.success(join(f.root, 'outside-cwd.out'), { cwd: f.outside });
  f.success('relative-from-temp.out', { cwd: f.outside });
  assert.deepEqual(readFileSync(join(f.outside, 'relative-from-temp.out')), f.bytes);
  assert.equal(existsSync(join(f.root, 'relative-from-temp.out')), false);
  f.success(join(f.outside, 'architecture-gate-policy.json'), { env: { RUNNER_TEMP: f.outside } });
  assert.deepEqual(readFileSync(join(f.outside, 'architecture-gate-policy.json')), f.bytes);
});

test('CLI rejects lexical escapes and physical leaf/parent escapes before touching external bytes', t => {
  const f = fixture(t);
  // This nonexistent absolute destination is outside checkout and recognized temporary roots.
  const denied = join(parse(f.root).root, `architecture-materializer-denied-${basename(f.directory)}`);
  for (const outputPath of [denied, relative(f.root, denied)]) {
    const result = f.run(outputPath); assert.equal(result.status, 1); assert.match(result.stderr, /Path traversal denied/); assert.equal(existsSync(denied), false);
  }
  const target = join(f.outside, 'sentinel'), sentinel = 'external sentinel\n'; writeFileSync(target, sentinel);
  const leaf = join(f.root, 'outside-leaf'), parent = join(f.root, 'outside-parent'); symlinkSync(target, leaf); symlinkSync(f.outside, parent);
  for (const outputPath of [leaf, join(parent, 'sentinel')]) {
    const result = f.run(outputPath); assert.equal(result.status, 1); assert.match(result.stderr, /Path traversal denied/); assert.equal(readFileSync(target, 'utf8'), sentinel);
  }
});

test('CLI preserves missing workspace and valid-output reader selection failures without output creation', t => {
  const f = fixture(t), outputPath = join(f.root, 'not-created');
  for (const value of [undefined, '']) {
    const result = f.run(outputPath, { env: { GITHUB_WORKSPACE: value } }); assert.equal(result.status, 1); assert.match(result.stderr, /Invalid committed snapshot selection: input\.txt/); assert.equal(existsSync(outputPath), false);
  }
  for (const options of [{ selectedCommit: 'malformed' }, { path: '../input.txt' }]) {
    const result = f.run(outputPath, options); assert.equal(result.status, 1); assert.match(result.stderr, /Invalid committed snapshot selection/); assert.equal(existsSync(outputPath), false);
  }
});

test('public API retains native descriptors and Buffer/URL destinations in source and emitted layouts', async t => {
  const f = fixture(t);
  for (const layout of ['src', 'dist']) {
    const { materializeRegularGitSnapshot } = await import(new URL(`../${layout}/materialize-regular-git-snapshot.mjs`, import.meta.url));
    const target = join(f.root, `${layout}-fd.out`), fd = openSync(target, 'w');
    try { materializeRegularGitSnapshot({ root: f.root, commit: f.commit, path: 'input.txt', outputPath: fd }); } finally { closeSync(fd); }
    assert.deepEqual(readFileSync(target), f.bytes);
    for (const [label, outputPath] of [['buffer', Buffer.from(join(f.root, `${layout}-buffer.out`))], ['url', pathToFileURL(join(f.root, `${layout}-url.out`))]]) {
      materializeRegularGitSnapshot({ root: f.root, commit: f.commit, path: 'input.txt', outputPath }); assert.deepEqual(readFileSync(join(f.root, `${layout}-${label}.out`)), f.bytes);
    }
  }
});

test('existing path guard permits same-root symlinks and does not protect external hardlink aliases', t => {
  const f = fixture(t), inside = join(f.root, 'inside-target'), outside = join(f.outside, 'hardlink-sentinel');
  writeFileSync(inside, 'old'); symlinkSync(inside, join(f.root, 'inside-link')); f.success(join(f.root, 'inside-link')); assert.deepEqual(readFileSync(inside), f.bytes);
  writeFileSync(outside, 'external hardlink sentinel\n'); linkSync(outside, join(f.root, 'hardlink')); f.success(join(f.root, 'hardlink')); assert.deepEqual(readFileSync(outside), f.bytes);
});

test('existing path guard does not promise protection from a parent replaced after validation', t => {
  const f = fixture(t), parent = join(f.root, 'race-parent'), target = join(f.outside, 'race-sentinel'); mkdirSync(parent); writeFileSync(target, 'external race sentinel\n');
  const preload = join(f.directory, 'race-preload.mjs');
  writeFileSync(preload, `import child from 'node:child_process';\nconst original = child.execFileSync;\nimport { renameSync, symlinkSync } from 'node:fs';\nimport { syncBuiltinESMExports } from 'node:module';\nchild.execFileSync = function(file,args,options) { const result = original(file,args,options); if (file === 'git' && args[0] === 'show') { renameSync(${JSON.stringify(parent)}, ${JSON.stringify(parent + '-old')}); symlinkSync(${JSON.stringify(f.outside)}, ${JSON.stringify(parent)}); } return result; };\nsyncBuiltinESMExports();\n`);
  const env = { ...process.env, GITHUB_WORKSPACE: f.root }; delete env.GITHUB_OUTPUT;
  const result = spawnSync(process.execPath, ['--import', preload, cli, f.commit, 'input.txt', join(parent, 'race-sentinel')], { cwd: f.root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.deepEqual(readFileSync(target), f.bytes);
});
