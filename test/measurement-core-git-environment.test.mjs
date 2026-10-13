import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const scenario of ['root','metadata','linked','missing-git','missing-root'])test(`diagnostic Git selection ignores foreign ambient overrides: ${scenario}`,()=>{
 const helper=new URL('./helpers/measurement-git-environment-child.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,[helper,scenario],{encoding:'utf8',timeout:15000});
 assert.equal(result.status,0,result.stderr);
});
