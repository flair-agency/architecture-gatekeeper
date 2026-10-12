import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const scenario of ['subdirectory-root', 'cwd-option', 'cwd-environment', 'cwd-null', 'cwd-empty', 'cwd-number',
  'resume-worktree', 'resume-native-worktree', 'resume-native-null', 'resume-native-empty', 'resume-native-number',
  'closed-warning', 'setup-warning', 'request-warning', 'finish-warning', 'resume-warning']) {
  test(`core containment and optional warning isolation: ${scenario}`, () => {
    const child = new URL('./helpers/measurement-core-fault-child.mjs', import.meta.url).pathname;
    const result = spawnSync(process.execPath, [child, scenario], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}
