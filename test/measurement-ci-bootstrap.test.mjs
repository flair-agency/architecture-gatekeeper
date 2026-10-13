import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
test('real CI diagnostic CLI contains bootstrap errors without altering required review', t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'agk-invalid-cli-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const runCi = (command, env) => spawnSync(process.execPath, [new URL('../dist/measurement-ci.mjs', import.meta.url).pathname, command],
    { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8' });
  for (const [command, env] of [['unexpected', { AGK_MEASUREMENT_DIR: join(root, 'records') }],
    ['start', { AGK_MEASUREMENT_DIR: join(root, 'forbidden'), GITHUB_WORKSPACE: root }]]) {
    const result = runCi(command, env);
    assert.equal(result.status, 0); assert.equal(result.stdout, ''); assert.equal(result.stderr, 'AGK measurement gap: CI diagnostic recording unavailable.\n');
  }
  const disabled = runCi('start', { AGK_MEASUREMENT_DIR: '' });
  assert.equal(disabled.status, 0); assert.equal(disabled.stdout, ''); assert.equal(disabled.stderr, '');

});

test('actual CI bootstrap CLI isolates an unavailable warning sink', t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'agk-ci-warning-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const helper = new URL('./helpers/measurement-ci-warning-child.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [helper], { cwd: root,
    env: { ...process.env, AGK_MEASUREMENT_DIR: join(root, 'forbidden'), GITHUB_WORKSPACE: root }, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); assert.equal(result.stdout, ''); assert.equal(result.stderr, '');
});

test('CI bootstrap refuses in-worktree targets before creating directories when workspace is missing or empty',t=>{
 const root=mkdtempSync(join(realpathSync(tmpdir()),'agk-ci-default-root-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const workspace of [undefined,'']){
  const target=join(root,workspace===undefined?'missing-root':'empty-root');
  const result=spawnSync(process.execPath,[new URL('../dist/measurement-ci.mjs',import.meta.url).pathname,'start'],{cwd:root,env:{...process.env,AGK_MEASUREMENT_DIR:target,GITHUB_WORKSPACE:workspace},encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);assert.equal(result.stdout,'');assert.equal(result.stderr,'AGK measurement gap: CI diagnostic recording unavailable.\n');assert.equal(existsSync(target),false);
 }
});
