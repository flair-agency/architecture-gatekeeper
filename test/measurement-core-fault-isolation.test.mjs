import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
for (const scenario of ['cwd-option', 'cwd-environment', 'closed-warning', 'setup-warning', 'request-warning', 'finish-warning', 'resume-warning']) {
  test(`core containment and optional warning isolation: ${scenario}`, t => {
    const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-core-fault-'));
    t.after(() => rmSync(parent, { recursive: true, force: true }));
    const root = join(parent, 'repo'); const directory = join(parent, 'records');
    mkdirSync(root); mkdirSync(directory, { mode: 0o700 });
    const child = new URL('./helpers/measurement-core-fault-child.mjs', import.meta.url).pathname;
    const result = spawnSync(process.execPath, [child, root, directory, scenario], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}
