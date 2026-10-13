import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync,spawn} from 'node:child_process';
import {mkdirSync,mkdtempSync,realpathSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadMeasurementDirectory} from '../dist/measurement.mjs';

for (const verdict of ['PASS','BLOCK']) test(`native stdout failure preserves validated ${verdict} with unknown publication`,t=>{
 const parent=mkdtempSync(join(realpathSync(tmpdir()),'agk-native-publication-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));
 const root=join(parent,'repo'),directory=join(parent,'records');mkdirSync(join(root,'.codex/gatekeeper'),{recursive:true});mkdirSync(directory,{mode:0o700});
 const files={'AGENTS.md':'# Fixture authority','candidate.md':'fixture','.codex/gatekeeper/prompt.md':'review','.codex/gatekeeper/schema.json':'{"type":"object"}', '.codex/gatekeeper/reviewer.json':'{"model":"fixture","reasoningEffort":"low"}', '.codex/gatekeeper/config.json':JSON.stringify({version:1,authorityFiles:['AGENTS.md'],requiredReportedAuthorityFiles:['AGENTS.md'],requiredPassArrays:['reviewedScope'],promptPath:'.codex/gatekeeper/prompt.md',schemaPath:'.codex/gatekeeper/schema.json',reviewerConfigPath:'.codex/gatekeeper/reviewer.json',reviewTimeoutMs:5000})};
 for(const [path,value]of Object.entries(files))writeFileSync(join(root,path),value);
 for(const args of [['init'],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid'],['config','commit.gpgSign','false'],['add','.'],['commit','-m','fixture']])execFileSync('git',args,{cwd:root,stdio:'ignore'});
 const cli=new URL('../dist/native-review.mjs',import.meta.url).pathname,request=join(parent,'request.json'),decision=join(parent,'decision.json'),env={...process.env,AGK_MEASUREMENT_DIR:directory};
 const prepared=spawnSync(process.execPath,[cli,'prepare',request,'fixture'],{cwd:root,env,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 const bytes=readFileSync(request);writeFileSync(decision,JSON.stringify({decision:verdict,authorityFiles:['AGENTS.md'],reviewedScope:['fixture'],findings:[]}));
 const helper=new URL('./helpers/measurement-native-publication-child.mjs',import.meta.url).pathname;
 const result=spawnSync(process.execPath,['--import',helper,cli,'validate',request,decision],{cwd:root,env,encoding:'utf8'});assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,/native output unavailable/);assert.deepEqual(readFileSync(request),bytes);
 const terminal=loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');assert.equal(terminal.state,'error');assert.equal(terminal.decision.decision,verdict);assert.equal(terminal.feedback.publication,'unknown');assert.equal(terminal.observation.failureStage,'publication');
});

function preparedFixture(t, prepare = true) {
 const parent=mkdtempSync(join(realpathSync(tmpdir()),'agk-native-publication-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));
 const root=join(parent,'repo'),directory=join(parent,'records');mkdirSync(join(root,'.codex/gatekeeper'),{recursive:true});mkdirSync(directory,{mode:0o700});
 const files={'AGENTS.md':'# Fixture authority','candidate.md':'fixture','.codex/gatekeeper/prompt.md':'review','.codex/gatekeeper/schema.json':'{"type":"object"}', '.codex/gatekeeper/reviewer.json':'{"model":"fixture","reasoningEffort":"low"}', '.codex/gatekeeper/config.json':JSON.stringify({version:1,authorityFiles:['AGENTS.md'],requiredReportedAuthorityFiles:['AGENTS.md'],requiredPassArrays:['reviewedScope'],promptPath:'.codex/gatekeeper/prompt.md',schemaPath:'.codex/gatekeeper/schema.json',reviewerConfigPath:'.codex/gatekeeper/reviewer.json',reviewTimeoutMs:5000})};
 for(const [path,value]of Object.entries(files))writeFileSync(join(root,path),value);
 for(const args of [['init'],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid'],['config','commit.gpgSign','false'],['add','.'],['commit','-m','fixture']])execFileSync('git',args,{cwd:root,stdio:'ignore'});
 const cli=new URL('../dist/native-review.mjs',import.meta.url).pathname,request=join(parent,'request.json'),decision=join(parent,'decision.json'),env={...process.env,AGK_MEASUREMENT_DIR:directory};
 if (prepare) { const prepared=spawnSync(process.execPath,[cli,'prepare',request,'fixture'],{cwd:root,env,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr); }
 return {root,directory,cli,request,decision,env,bytes:prepare ? readFileSync(request) : null};
}

for (const fault of ['missing', 'malformed', 'nonfile']) test(`native decision read failure remains observable after retry: ${fault}`, t => {
 const {root,directory,cli,request,decision,env,bytes} = preparedFixture(t);
 if (fault === 'malformed') writeFileSync(decision,'{broken');
 if (fault === 'nonfile') mkdirSync(decision);
 const failed = spawnSync(process.execPath,[cli,'validate',request,decision],{cwd:root,env,encoding:'utf8'});
 assert.equal(failed.status,2,failed.stderr);assert.equal(failed.stdout,'');assert.deepEqual(readFileSync(request),bytes);
 const observed = loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');
 assert.ok(observed);assert.equal(observed.state,'error');assert.equal(observed.decision,null);assert.equal(observed.feedback.publication,'unknown');assert.equal(observed.observation.failureStage,'decision-read');
 rmSync(decision,{recursive:true,force:true});writeFileSync(decision,JSON.stringify({decision:'PASS',authorityFiles:['AGENTS.md'],reviewedScope:['fixture'],findings:[]}));
 const retry = spawnSync(process.execPath,[cli,'validate',request,decision],{cwd:root,env,encoding:'utf8'});
 assert.equal(retry.status,0,retry.stderr);assert.equal(JSON.parse(retry.stdout).decision,'PASS');
 const terminals=loadMeasurementDirectory(directory).records.filter(r=>r.phase==='terminal');
 assert.equal(terminals.length,2);assert.deepEqual(terminals.find(r=>r.attemptId===observed.attemptId),observed);
 assert.equal(terminals.find(r=>r.attemptId!==observed.attemptId).decision.decision,'PASS');
});

for (const fault of ['missing-config','malformed-config','missing-authority','unresolved-repository']) test(`native preparation failure preserves required error and error observation: ${fault}`, t => {
 const {root,directory,cli,request,env} = preparedFixture(t,false);
 let cwd = root;
 if (fault === 'unresolved-repository') { cwd = join(root,'..','not-a-repository');mkdirSync(cwd); }
 else {
  if(fault==='missing-config')rmSync(join(root,'.codex/gatekeeper/config.json'));
  if(fault==='malformed-config')writeFileSync(join(root,'.codex/gatekeeper/config.json'),'{bad');
  if(fault==='missing-authority')rmSync(join(root,'AGENTS.md'));
  execFileSync('git',['add','-A'],{cwd:root,stdio:'ignore'});execFileSync('git',['commit','-m','failed preparation fixture'],{cwd:root,stdio:'ignore'});
 }
 const invoke = dir => spawnSync(process.execPath,[cli,'prepare',request,'fixture'],{cwd,env:{...env,AGK_MEASUREMENT_DIR:dir},encoding:'utf8'});
 const original=invoke(''), observed=invoke(directory);
 assert.equal(observed.status,2,observed.stderr);assert.equal(observed.status,original.status);assert.equal(observed.stdout,original.stdout);assert.equal(observed.stderr,original.stderr);
 const records=loadMeasurementDirectory(directory).records;assert.deepEqual(records.map(r=>r.phase).sort(),['start','terminal']);
 const terminal=records.find(r=>r.phase==='terminal');assert.equal(terminal.state,'error');assert.equal(terminal.request,null);assert.equal(terminal.decision,null);assert.equal(terminal.feedback.publication,'unknown');assert.equal(terminal.observation.failureStage,'preparation');
});
for (const fault of ['missing','malformed','nonfile']) test(`native request read failure remains an independent observation after retry: ${fault}`, t => {
 const {root,directory,cli,request,decision,env,bytes}=preparedFixture(t);
 rmSync(request);if(fault==='malformed')writeFileSync(request,'{broken');if(fault==='nonfile')mkdirSync(request);
 const invoke=dir=>spawnSync(process.execPath,[cli,'validate',request,decision],{cwd:root,env:{...env,AGK_MEASUREMENT_DIR:dir},encoding:'utf8'});
 const original=invoke(''), observed=invoke(directory);assert.equal(observed.status,2,observed.stderr);assert.equal(observed.stderr,original.stderr);assert.equal(observed.stdout,original.stdout);
 const failure=loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');assert.ok(failure);assert.equal(failure.state,'error');assert.equal(failure.request,null);assert.equal(failure.observation.failureStage,'request-read');
 rmSync(request,{recursive:true,force:true});writeFileSync(request,bytes);writeFileSync(decision,JSON.stringify({decision:'PASS',authorityFiles:['AGENTS.md'],reviewedScope:['fixture'],findings:[]}));
 const retry=invoke(directory);assert.equal(retry.status,0,retry.stderr);assert.equal(JSON.parse(retry.stdout).decision,'PASS');
 const terminals=loadMeasurementDirectory(directory).records.filter(r=>r.phase==='terminal');assert.equal(terminals.length,2);assert.deepEqual(terminals.find(r=>r.attemptId===failure.attemptId),failure);assert.equal(terminals.find(r=>r.attemptId!==failure.attemptId).decision.decision,'PASS');
});

for (const payload of [null,{},'invalid request']) test(`native invalid request shape is observed independently: ${JSON.stringify(payload)}`,t=>{
 const {root,directory,cli,request,decision,env,bytes}=preparedFixture(t);
 writeFileSync(request,JSON.stringify(payload));writeFileSync(decision,JSON.stringify({decision:'PASS',authorityFiles:['AGENTS.md'],reviewedScope:['fixture'],findings:[]}));
 const invoke=dir=>spawnSync(process.execPath,[cli,'validate',request,decision],{cwd:root,env:{...env,AGK_MEASUREMENT_DIR:dir},encoding:'utf8'});
 const original=invoke(''),observed=invoke(directory);assert.equal(observed.status,2,observed.stderr);assert.equal(observed.stdout,original.stdout);assert.ok(observed.stderr.endsWith(original.stderr));
 const failure=loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');assert.ok(failure);assert.equal(failure.state,'error');assert.equal(failure.request,null);assert.equal(failure.observation.failureStage,'validation');
 writeFileSync(request,bytes);const retry=invoke(directory);assert.equal(retry.status,0,retry.stderr);
 assert.deepEqual(loadMeasurementDirectory(directory).records.find(r=>r.attemptId===failure.attemptId&&r.phase==='terminal'),failure);
});
test('native semantic validation failure remains visible after valid retry',t=>{
 const {root,directory,cli,request,decision,env}=preparedFixture(t);
 const invoke=dir=>spawnSync(process.execPath,[cli,'validate',request,decision],{cwd:root,env:{...env,AGK_MEASUREMENT_DIR:dir},encoding:'utf8'});
 writeFileSync(decision,JSON.stringify({decision:'PASS',authorityFiles:[],reviewedScope:[]}));
 const original=invoke(''),observed=invoke(directory);assert.equal(observed.status,2,observed.stderr);assert.equal(observed.stderr,original.stderr);assert.equal(observed.stdout,'');
 const failure=loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');assert.equal(failure.state,'error');assert.equal(failure.decision,null);assert.equal(failure.observation.failureStage,'validation');
 writeFileSync(decision,JSON.stringify({decision:'PASS',authorityFiles:['AGENTS.md'],reviewedScope:['fixture'],findings:[]}));const retry=invoke(directory);assert.equal(retry.status,0,retry.stderr);assert.equal(JSON.parse(retry.stdout).decision,'PASS');
 const terminals=loadMeasurementDirectory(directory).records.filter(r=>r.phase==='terminal');
 assert.equal(terminals.length,2);assert.deepEqual(terminals.find(r=>r.attemptId===failure.attemptId),failure);
 const success=terminals.find(r=>r.attemptId!==failure.attemptId);assert.equal(success.state,'completed');assert.equal(success.decision.decision,'PASS');
});

for(const verdict of ['PASS','BLOCK']) test(`native closed real stdout pipe retains ${verdict} as an unpublished error`,async t=>{
  const {root,directory,cli,request,decision,env}=preparedFixture(t);
  writeFileSync(decision,JSON.stringify({decision:verdict,authorityFiles:['AGENTS.md'],reviewedScope:['fixture'],findings:[]}));
  const child=spawn(process.execPath,[cli,'validate',request,decision],{cwd:root,env,stdio:['ignore','pipe','pipe']});
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',chunk=>{stderr+=chunk;});
  const closed=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  const timeout=setTimeout(()=>child.kill('SIGKILL'),10000);t.after(()=>clearTimeout(timeout));
  child.stdout.destroy();const result=await closed;assert.equal(result.code,2,stderr);assert.match(stderr,/EPIPE|broken pipe/i);
  const terminal=loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');
  assert.equal(terminal.state,'error');assert.equal(terminal.decision.decision,verdict);
  assert.equal(terminal.feedback.publication,'unknown');assert.equal(terminal.observation.failureStage,'publication');
});
