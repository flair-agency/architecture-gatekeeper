import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';

test('loading checks effective worktree root before enumeration or reads, including nested invocations',t=>{
  const root=mkdtempSync(join(realpathSync(tmpdir()),'agk-load-containment-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const repo=join(root,'repo'),nested=join(repo,'nested'),records=join(repo,'.diagnostics');mkdirSync(nested,{recursive:true});mkdirSync(records,{mode:0o700});
  execFileSync('git',['init'],{cwd:repo,stdio:'ignore'});
  writeFileSync(join(records,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.start.json'),JSON.stringify({version:1,kind:'agk-diagnostic',attemptId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',phase:'start',route:'manual',startedAt:'2026-10-01T00:00:00Z',context:{private:'private narrative'}}));
  const module=new URL('../dist/measurement.mjs',import.meta.url).href;
  for(const cwd of [repo,nested]){
    const script=`import assert from 'node:assert/strict';import fs from 'node:fs';import {syncBuiltinESMExports} from 'node:module';import {loadMeasurementDirectory} from ${JSON.stringify(module)};let reads=0;const open=fs.opendirSync,read=fs.readSync;fs.opendirSync=(...a)=>{reads++;return open(...a);};fs.readSync=(...a)=>{reads++;return read(...a);};syncBuiltinESMExports();assert.throws(()=>loadMeasurementDirectory(${JSON.stringify(records)}),/outside the reviewed worktree/);assert.equal(reads,0);`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd,encoding:'utf8',timeout:5000});assert.equal(result.status,0,result.stderr);
  }
});
