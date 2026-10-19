import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, linkSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

// Each caller supplies an otherwise valid real CLI context. An earlier failure
// cannot satisfy these checks: the error must come from the output adapter.
export function assertGitHubOutputCliBoundary({ root, args, env, label }) {
  const directory = join(root, `output-boundary-${label}`);
  mkdirSync(directory);
  const target = join(directory, 'target');
  const sentinel = 'protected output sentinel\n';
  writeFileSync(target, sentinel);
  const symlink = join(directory, 'symlink');
  symlinkSync(target, symlink);
  const hardlink = join(directory, 'hardlink');
  linkSync(target, hardlink);
  const parent = join(directory, 'linked-parent');
  symlinkSync(directory, parent);
  const direct = join(directory, 'direct');
  writeFileSync(direct, sentinel);
  const missing = join(directory, 'missing');
  const relative = `output-boundary-${label}/direct`;
  const cases = [
    [relative, /GitHub output must be a canonical absolute path/],
    [missing, /runner-created output file is unavailable/],
    [symlink, /runner-created output is not a direct regular file/],
    [hardlink, /runner-created output is not a direct regular file/],
    [join(parent, 'direct'), /runner-created output is not a direct regular file/],
    [directory, /runner-created output is not a direct regular file/],
  ];
  for (const [path, error] of cases) {
    const result = spawnSync(process.execPath, args, { cwd: root, env: { ...env, GITHUB_OUTPUT: path }, encoding: 'utf8' });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1, `${label}: ${path}`);
    assert.match(result.stderr, error);
    assert.equal(readFileSync(target, 'utf8'), sentinel);
    assert.equal(readFileSync(direct, 'utf8'), sentinel);
    assert.equal(existsSync(missing), false);
  }
}
