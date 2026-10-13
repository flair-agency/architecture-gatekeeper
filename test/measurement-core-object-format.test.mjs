import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {beginMeasurement,loadMeasurementDirectory,measurementDigest} from '../dist/measurement.mjs';
import {readCommittedAuthorityFile} from '../dist/authority-set.mjs';

for(const objectFormat of ['sha1','sha256'])test(`diagnostic committed metadata preserves ${objectFormat} blob identities without widening authority selection`,t=>{
  const parent=mkdtempSync(join(realpathSync(tmpdir()),'agk-object-format-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));
  const root=join(parent,'repo'),records=join(parent,'records');mkdirSync(join(root,'.codex/gatekeeper'),{recursive:true});mkdirSync(records,{mode:0o700});
  const config=JSON.stringify({validationPath:'.codex/gatekeeper/validation.json',reviewerConfigPath:'.codex/gatekeeper/reviewer.json'}),validation='{"required":[]}',reviewer='{"model":"fixture"}';
  for(const [name,value]of [['config.json',config],['validation.json',validation],['reviewer.json',reviewer]])writeFileSync(join(root,'.codex/gatekeeper',name),value);
  for(const args of [['init',`--object-format=${objectFormat}`],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid'],['config','commit.gpgSign','false'],['add','.'],['commit','-m','fixture']])execFileSync('git',args,{cwd:root,stdio:'ignore'});
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();assert.equal(head.length,objectFormat==='sha1'?40:64);
  const attempt=beginMeasurement({route:'manual',cwd:root,directory:records});assert.ok(attempt.id);
  attempt.request({repositoryRoot:root,reviewedRevision:head,requestId:'a'.repeat(64)}, {kind:'tracked-working-tree'});
  const request=loadMeasurementDirectory(records).records.find(r=>r.phase==='prepared').request;
  assert.deepEqual(request.selectedInputDigests,{configSha256:measurementDigest(config),validationPath:measurementDigest(validation),reviewerConfigPath:measurementDigest(reviewer)});
  if(objectFormat==='sha256')assert.throws(()=>readCommittedAuthorityFile(root,head,'.codex/gatekeeper/config.json',65536),/not a regular file/);
  else assert.equal(readCommittedAuthorityFile(root,head,'.codex/gatekeeper/config.json',65536).toString(),config);
});
