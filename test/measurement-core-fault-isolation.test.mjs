import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawnSync } from 'node:child_process';
for (const scenario of ['subdirectory-root', 'cwd-option', 'cwd-environment', 'cwd-null', 'cwd-empty', 'cwd-number',
  'resume-worktree', 'resume-native-worktree', 'resume-native-null', 'resume-native-empty', 'resume-native-number',
  'closed-warning', 'setup-warning', 'request-warning', 'finish-warning', 'resume-warning', 'resume-cwd-unavailable']) {
  test(`core containment and optional warning isolation: ${scenario}`, () => {
    const child = new URL('./helpers/measurement-core-fault-child.mjs', import.meta.url).pathname;
    const result = spawnSync(process.execPath, [child, scenario], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}


describe('optional request capture returns a metadata gap when Git stalls', { concurrency: 3 }, () => {
  for (const stage of ['ls-tree','blob','slow-sequence']) {
    test(`optional request capture returns a metadata gap when Git ${stage} stalls`,
      { skip: process.platform === 'win32' }, async () => {
        const child = new URL('./helpers/measurement-git-bound-child.mjs', import.meta.url).pathname;
        await new Promise((resolve, reject) => {
          execFile(process.execPath, [child, stage], { encoding: 'utf8', timeout: 20_000, maxBuffer: 1024 * 1024 },
            (error, _stdout, stderr) => {
              if (error) reject(new Error(`Git ${stage} child failed: ${stderr || error.message}`, { cause: error }));
              else resolve();
            });
        });
      });
  }
});
