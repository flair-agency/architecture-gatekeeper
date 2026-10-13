import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const scenario of ['valid','malformed','invalid-utf8','partial-read-failure']) test(`directory aggregate bound refuses partial ${scenario} history under a constrained heap without changing required results`,{skip:process.platform==='win32'},()=>{
 const child=new URL('./helpers/measurement-directory-budget-child.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,['--max-old-space-size=64',child,scenario],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);assert.equal(result.error,undefined);
});
