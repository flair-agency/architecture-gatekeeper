import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

for(const scenario of ['root','nested'])test(`loading rejects ${scenario} worktree storage before enumeration or reads`,()=>{
  const helper=new URL('./helpers/measurement-loader-containment-child.mjs',import.meta.url).pathname;
  const result=spawnSync(process.execPath,[helper,scenario],{encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);
});
