import assert from 'node:assert/strict';
import fs from 'node:fs';
import {syncBuiltinESMExports} from 'node:module';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {loadMeasurementDirectory} from '../../dist/measurement.mjs';

assert.ok(['root','nested'].includes(process.argv[2]));
const original=process.cwd();
const parent=fs.mkdtempSync(join(fs.realpathSync(tmpdir()),'agk-load-containment-'));
try {
  const repo=join(parent,'repo'),nested=join(repo,'nested'),records=join(repo,'.diagnostics');
  fs.mkdirSync(nested,{recursive:true});fs.mkdirSync(records,{mode:0o700});
  execFileSync('git',['init'],{cwd:repo,stdio:'ignore'});
  fs.writeFileSync(join(records,'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.start.json'),JSON.stringify({version:1,kind:'agk-diagnostic',attemptId:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',phase:'start',route:'manual',startedAt:'2026-10-01T00:00:00Z',context:{private:'private narrative'}}));
  process.chdir(process.argv[2]==='nested'?nested:repo);
  let reads=0;const open=fs.opendirSync,read=fs.readSync;
  fs.opendirSync=(...args)=>{reads++;return open(...args);};
  fs.readSync=(...args)=>{reads++;return read(...args);};syncBuiltinESMExports();
  assert.throws(()=>loadMeasurementDirectory(records),/outside the reviewed worktree/);assert.equal(reads,0);
} finally {process.chdir(original);fs.rmSync(parent,{recursive:true,force:true});}
