import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
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
 const result=spawnSync(process.execPath,[helper,request,decision],{cwd:root,env,encoding:'utf8'});assert.equal(result.status,2,result.stderr);assert.equal(result.stdout,'');assert.match(result.stderr,/native output unavailable/);assert.deepEqual(readFileSync(request),bytes);
 const terminal=loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');assert.equal(terminal.state,'error');assert.equal(terminal.decision.decision,verdict);assert.equal(terminal.feedback.publication,'unknown');assert.equal(terminal.observation.failureStage,'publication');
});

function preparedFixture(t) {
 const parent=mkdtempSync(join(realpathSync(tmpdir()),'agk-native-publication-'));t.after(()=>rmSync(parent,{recursive:true,force:true}));
 const root=join(parent,'repo'),directory=join(parent,'records');mkdirSync(join(root,'.codex/gatekeeper'),{recursive:true});mkdirSync(directory,{mode:0o700});
 const files={'AGENTS.md':'# Fixture authority','candidate.md':'fixture','.codex/gatekeeper/prompt.md':'review','.codex/gatekeeper/schema.json':'{"type":"object"}', '.codex/gatekeeper/reviewer.json':'{"model":"fixture","reasoningEffort":"low"}', '.codex/gatekeeper/config.json':JSON.stringify({version:1,authorityFiles:['AGENTS.md'],requiredReportedAuthorityFiles:['AGENTS.md'],requiredPassArrays:['reviewedScope'],promptPath:'.codex/gatekeeper/prompt.md',schemaPath:'.codex/gatekeeper/schema.json',reviewerConfigPath:'.codex/gatekeeper/reviewer.json',reviewTimeoutMs:5000})};
 for(const [path,value]of Object.entries(files))writeFileSync(join(root,path),value);
 for(const args of [['init'],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid'],['config','commit.gpgSign','false'],['add','.'],['commit','-m','fixture']])execFileSync('git',args,{cwd:root,stdio:'ignore'});
 const cli=new URL('../dist/native-review.mjs',import.meta.url).pathname,request=join(parent,'request.json'),decision=join(parent,'decision.json'),env={...process.env,AGK_MEASUREMENT_DIR:directory};
 const prepared=spawnSync(process.execPath,[cli,'prepare',request,'fixture'],{cwd:root,env,encoding:'utf8'});assert.equal(prepared.status,0,prepared.stderr);
 return {root,directory,cli,request,decision,env,bytes:readFileSync(request)};
}

for (const fault of ['missing', 'malformed', 'nonfile']) test(`native decision read failure remains observable after retry: ${fault}`, t => {
 const {root,directory,cli,request,decision,env,bytes} = preparedFixture(t);
 if (fault === 'malformed') writeFileSync(decision,'{broken');
 if (fault === 'nonfile') mkdirSync(decision);
 const failed = spawnSync(process.execPath,[cli,'validate',request,decision],{cwd:root,env,encoding:'utf8'});
 assert.equal(failed.status,2,failed.stderr);assert.equal(failed.stdout,'');assert.deepEqual(readFileSync(request),bytes);
 const observed = loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal');
 assert.ok(observed);assert.equal(observed.state,'error');assert.equal(observed.decision,null);assert.equal(observed.feedback.publication,'unknown');assert.equal(observed.observation.failureStage,'validation-or-preparation');
 rmSync(decision,{recursive:true,force:true});writeFileSync(decision,JSON.stringify({decision:'PASS',authorityFiles:['AGENTS.md'],reviewedScope:['fixture'],findings:[]}));
 const retry = spawnSync(process.execPath,[cli,'validate',request,decision],{cwd:root,env,encoding:'utf8'});
 assert.equal(retry.status,0,retry.stderr);assert.equal(JSON.parse(retry.stdout).decision,'PASS');
 assert.deepEqual(loadMeasurementDirectory(directory).records.find(r=>r.phase==='terminal'),observed);
});
