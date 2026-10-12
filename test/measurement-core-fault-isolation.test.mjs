import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
for (const scenario of ['subdirectory-root', 'cwd-option', 'cwd-environment', 'cwd-null', 'cwd-empty', 'cwd-number',
  'resume-worktree', 'resume-native-worktree', 'resume-native-null', 'resume-native-empty', 'resume-native-number',
  'closed-warning', 'setup-warning', 'request-warning', 'finish-warning', 'resume-warning', 'resume-cwd-unavailable']) {
  test(`core containment and optional warning isolation: ${scenario}`, () => {
    const child = new URL('./helpers/measurement-core-fault-child.mjs', import.meta.url).pathname;
    const result = spawnSync(process.execPath, [child, scenario], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
}


for (const stage of ['ls-tree','blob']) {
  test(`optional request capture returns a metadata gap when Git ${stage} stalls`,{skip:process.platform==='win32'},()=>{
    const child=new URL('./helpers/measurement-git-bound-child.mjs',import.meta.url).pathname;
    const result=spawnSync(process.execPath,[child,stage],{encoding:'utf8',timeout:20000});
    assert.equal(result.status,0,result.stderr);assert.equal(result.error,undefined);
  });
}
