import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {beginMeasurement,loadMeasurementDirectory,measurementDigest,resolveMeasurementWorkingRoot} from '../../dist/measurement.mjs';
assert.ok(['root','metadata','linked'].includes(process.argv[2]));
const parent=mkdtempSync(join(realpathSync(tmpdir()),'agk-git-env-')),originalEnv={...process.env};
const cleanEnv=Object.fromEntries(Object.entries(process.env).filter(([key])=>!/^GIT_/i.test(key)));
const git=(root,args)=>execFileSync('git',args,{cwd:root,env:cleanEnv,encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
try {
 const a=join(parent,'a'),b=join(parent,'b'),records=join(parent,'records');mkdirSync(records,{mode:0o700});
 for(const root of [a,b]) {mkdirSync(join(root,'.codex/gatekeeper'),{recursive:true});writeFileSync(join(root,'.codex/gatekeeper/config.json'),JSON.stringify({label:root===a?'reviewed':'foreign'}));
  for(const args of [['init'],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid'],['config','commit.gpgSign','false'],['add','.'],['commit','-m','fixture']])git(root,args);
 }
 const head=git(a,['rev-parse','HEAD']);let root=a;
 if(process.argv[2]==='linked'){root=join(parent,'linked');git(a,['worktree','add','--detach',root,head]);}
 const nested=join(root,'nested'),inside=join(root,'.diagnostics');mkdirSync(nested);mkdirSync(inside,{mode:0o700});
 const overrides=[{GIT_DIR:join(b,'.git'),GIT_WORK_TREE:b},{GIT_WORK_TREE:b},{GIT_DIR:join(b,'.git'),GIT_COMMON_DIR:join(b,'.git')},{GIT_CONFIG_COUNT:'1',GIT_CONFIG_KEY_0:'core.worktree',GIT_CONFIG_VALUE_0:b}];
 for(const override of overrides) {
  for(const key of Object.keys(process.env))if(/^GIT_/i.test(key))delete process.env[key];
  if(process.argv[2]==='metadata') {
   const attempt=beginMeasurement({route:'manual',cwd:root,directory:records});assert.ok(attempt.id);Object.assign(process.env,override);
   attempt.request({repositoryRoot:root,reviewedRevision:head,requestId:'a'.repeat(64)});
   const observed=loadMeasurementDirectory(records,root).records.find(r=>r.attemptId===attempt.id&&r.phase==='prepared');
   assert.equal(observed.request.selectedInputDigests.configSha256,measurementDigest(JSON.stringify({label:'reviewed'})));
  } else {
   Object.assign(process.env,override);assert.equal(resolveMeasurementWorkingRoot(nested),root);
   assert.equal(beginMeasurement({route:'manual',cwd:nested,directory:inside}).id,null);assert.deepEqual(readdirSync(inside),[]);
   const attempt=beginMeasurement({route:'manual',cwd:nested,directory:records});assert.ok(attempt.id);
   assert.equal(loadMeasurementDirectory(records,root).records.find(r=>r.attemptId===attempt.id).repositoryId,measurementDigest(root));
  }
 }
} finally {
 for(const key of Object.keys(process.env))if(/^GIT_/i.test(key))delete process.env[key];Object.assign(process.env,originalEnv);rmSync(parent,{recursive:true,force:true});
}
