import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,realpathSync,rmSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {retrieveCiReviewJob} from '../dist/measurement-ci-jobs.mjs';
import {collectCiMeasurement} from '../dist/measurement-ci.mjs';
import {loadMeasurementDirectory,redactMeasurement} from '../dist/measurement.mjs';

function metadata() {
  const env={GITHUB_REPOSITORY:'owner/repo',GITHUB_SERVER_URL:'https://github.com',GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:'c'.repeat(40),HEAD_SHA:'a'.repeat(40),REVIEW_RESULT:'success',REVIEW_DECISION_KIND:'PASS',REVIEWED_SHA:'b'.repeat(40)};
  const run={id:123,run_attempt:2,head_sha:env.HEAD_SHA,repository:{full_name:'owner/repo',private:false}};
  const job={id:456,run_id:123,run_attempt:2,run_url:'https://api.github.com/repos/owner/repo/actions/runs/123',head_sha:env.HEAD_SHA,status:'completed',conclusion:'success',
    started_at:'2025-01-01T00:00:00Z',completed_at:'2025-01-01T00:00:10Z',steps:[{name:'Run read-only architecture review',status:'completed',conclusion:'success',started_at:'2025-01-01T00:00:01Z',completed_at:'2025-01-01T00:00:09Z'}]};
  const data={total_count:1,jobs:[job]};
  const calls=[];
  const fetchImpl=async (url,init)=>{calls.push({url:String(url),init});return new Response(JSON.stringify(String(url).includes('/jobs?')?data:run));};
  return {env,run,job,data,calls,fetchImpl};
}
test('public acquisition binds exact repository/run/attempt and keeps job/step timing separately',async()=>{
  const f=metadata();Object.assign(f.env,{GH_TOKEN:'private',GITHUB_TOKEN:'private',OPENAI_API_KEY:'private'});
  const result=await retrieveCiReviewJob(f.env,f.fetchImpl);
  assert.deepEqual(result,{jobId:'456',jobOutcome:'success',stepOutcome:'success',jobTiming:{startedAt:f.job.started_at,completedAt:f.job.completed_at,elapsedMs:10000},reviewTiming:{startedAt:f.job.steps[0].started_at,completedAt:f.job.steps[0].completed_at,elapsedMs:8000}});
  assert.equal(f.calls.length,2);
  assert.deepEqual(f.calls.map(c=>c.url),['https://api.github.com/repos/owner/repo/actions/runs/123/attempts/2','https://api.github.com/repos/owner/repo/actions/runs/123/attempts/2/jobs?per_page=100']);
  for(const {init} of f.calls){assert.equal(init.redirect,'manual');assert.deepEqual(init.headers,{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'});assert.equal(init.credentials,undefined);assert.equal(init.signal.aborted,true);}
});

for(const [label,mutate] of [
  ['unsafe numeric run',f=>{f.env.GITHUB_RUN_ID=String(Number.MAX_SAFE_INTEGER+1);f.run.id=Number.MAX_SAFE_INTEGER+1;}], ['unsafe numeric attempt',f=>{f.env.GITHUB_RUN_ATTEMPT=String(Number.MAX_SAFE_INTEGER+1);f.run.run_attempt=Number.MAX_SAFE_INTEGER+1;}],
  ['repository',f=>{f.run.repository.full_name='other/repo';}],['private repository',f=>{f.run.repository.private=true;}],
  ['run id',f=>{f.run.id=124;}],['run attempt',f=>{f.run.run_attempt=1;}],['run revision',f=>{f.run.head_sha='c'.repeat(40);}],
  ['missing job',f=>{f.data.jobs=[];f.data.total_count=0;}],['ambiguous jobs',f=>{f.data.jobs.push(structuredClone(f.job));f.data.total_count=2;}],
  ['partial page',f=>{f.data.total_count=2;}],['job run',f=>{f.job.run_id=124;}],['job attempt',f=>{f.job.run_attempt=1;}],
  ['job revision',f=>{f.job.head_sha='c'.repeat(40);}],['job repository',f=>{f.job.run_url=f.job.run_url.replace('owner','other');}],
  ['incomplete job',f=>{f.job.status='in_progress';}],['job outcome conflict',f=>{f.job.conclusion='failure';}],
  ['ambiguous step',f=>{f.job.steps.push(structuredClone(f.job.steps[0]));}],['missing step',f=>{f.job.steps=[];}],
  ['incomplete step',f=>{f.job.steps[0].status='in_progress';}],['invalid timestamp',f=>{f.job.started_at='2025-02-30T00:00:00Z';}],
  ['negative interval',f=>{f.job.completed_at='2024-01-01T00:00:00Z';}],['outside job',f=>{f.job.steps[0].completed_at='2025-01-01T00:01:00Z';}],
]) test(`public acquisition refuses ${label}`,async()=>{const f=metadata();mutate(f);await assert.rejects(retrieveCiReviewJob(f.env,f.fetchImpl));assert.ok(f.calls.length<=2);});

test('invalid host selections fail before network; disabled capture performs no acquisition',async()=>{
  for(const patch of [{GITHUB_SERVER_URL:'https://private.example'}, {GITHUB_REPOSITORY:'owner/../repo'}, {GITHUB_RUN_ID:'0'}, {GITHUB_RUN_ATTEMPT:'1e2'}, {HEAD_SHA:'main'}, {REVIEW_RESULT:'unknown'}]){
    const f=metadata();await assert.rejects(retrieveCiReviewJob({...f.env,...patch},f.fetchImpl));assert.equal(f.calls.length,0);
  }
  const f=metadata();await collectCiMeasurement(f.env,f.fetchImpl);assert.equal(f.calls.length,0);
});
for(const [label,response] of [
  ['private/unavailable',()=>new Response('',{status:404})],['rate limited',()=>new Response('',{status:403})],
  ['redirect',()=>new Response('',{status:302,headers:{location:'https://private.example'}})],
  ['duplicate keys',()=>new Response('{"id":123,"id":124}')],['invalid UTF-8',()=>new Response(new Uint8Array([255]))],
  ['declared overflow',()=>new Response('{}',{headers:{'content-length':String(256*1024+1)}})],
]) test(`anonymous acquisition has no retry or credential fallback after ${label}`,async()=>{
  const f=metadata();let count=0;await assert.rejects(retrieveCiReviewJob(f.env,async()=>{count++;return response();}));assert.equal(count,1);
});

test('streamed overflow and empty chunks stop the reader and cancel without awaiting cleanup',async()=>{
  for(const chunks of [[new Uint8Array(256*1024),new Uint8Array(1)],[new Uint8Array(0)]]){
    const f=metadata();let reads=0,cancelled=0;
    const response={status:200,redirected:false,url:'',headers:new Headers(),body:{getReader(){return {read:async()=>({done:false,value:chunks[reads++]}),cancel(){cancelled++;return new Promise(()=>{});}};}}};
    await assert.rejects(retrieveCiReviewJob(f.env,async()=>response));assert.equal(reads,chunks.length);assert.equal(cancelled,1);
  }
});
test('deadline covers a stalled fetch or reader that ignores abort',async()=>{
  for(const stall of ['fetch','reader']){
    const f=metadata();let cancelled=0;
    const fetchImpl=stall==='fetch'?()=>new Promise(()=>{}):async()=>({status:200,redirected:false,url:'',headers:new Headers(),body:{getReader(){return {read:()=>new Promise(()=>{}),cancel(){cancelled++;return new Promise(()=>{});}};}}});
    const started=performance.now();await assert.rejects(retrieveCiReviewJob(f.env,fetchImpl,10),/deadline exceeded/);assert.ok(performance.now()-started<1000);
    assert.equal(cancelled,stall==='reader'?1:0);
  }
});

function storage(t,f){
  const root=mkdtempSync(join(realpathSync(tmpdir()),'agk-post-review-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
  const records=join(root,'records'),output=join(root,'output');mkdirSync(records,{mode:0o700});writeFileSync(output,'');
  const prior=process.env.GITHUB_OUTPUT;process.env.GITHUB_OUTPUT=output;t.after(()=>{if(prior===undefined)delete process.env.GITHUB_OUTPUT;else process.env.GITHUB_OUTPUT=prior;});
  f.env.AGK_MEASUREMENT_DIR=records;f.env.GITHUB_WORKSPACE=process.cwd();return {records,output};
}
test('independent collector uses published decision only, leaves unavailable identities/counts unknown, and exports checked timing',async t=>{
  const f=metadata(),s=storage(t,f);f.env.REVIEW_RESPONSE='private findings';f.env.REVIEW_MODEL='private model';
  await collectCiMeasurement(f.env,f.fetchImpl);
  assert.match(readFileSync(s.output,'utf8'),/^review_attempt_id=[0-9a-f-]{36}\n$/);
  const terminal=loadMeasurementDirectory(s.records).records.find(r=>r.phase==='terminal'),redacted=redactMeasurement(terminal);
  assert.deepEqual(terminal.decision,{decision:'PASS'});assert.equal(redacted.findingCount,null);assert.equal(redacted.requestId,null);assert.equal(redacted.promptSha256,null);assert.equal(redacted.schemaSha256,null);
  assert.equal(redacted.observation.timingSource,'collector');assert.equal(redacted.observation.reviewTiming.elapsedMs,8000);assert.equal(redacted.observation.jobTiming.elapsedMs,10000);
  assert.notEqual(terminal.startedAt,f.job.started_at);assert.equal(terminal.execution,null);assert.ok(!JSON.stringify(redacted).includes('private'));
});
for(const mode of ['success without published decision','failed review','conflicting published decision','metadata unavailable','missing reviewed revision','unsuccessful model step'])test(`independent collector keeps ${mode} as an explicit gap`,async t=>{
  const f=metadata(),s=storage(t,f);if(mode==='success without published decision')delete f.env.REVIEW_DECISION_KIND;
  if(mode==='missing reviewed revision')delete f.env.REVIEWED_SHA;
  if(mode==='unsuccessful model step')f.job.steps[0].conclusion='failure';
  if(mode==='failed review'){f.env.REVIEW_RESULT='failure';f.job.conclusion='failure';f.job.steps[0].conclusion='failure';}
  if(mode==='conflicting published decision'){f.env.REVIEW_DECISION_KIND='BLOCK';f.env.REVIEW_PASS_CONCLUSION='PASS';}
  await collectCiMeasurement(f.env,mode==='metadata unavailable'?async()=>new Response('',{status:404}):f.fetchImpl);
  const terminal=loadMeasurementDirectory(s.records).records.find(r=>r.phase==='terminal');assert.equal(terminal.state,'incomplete');assert.equal(terminal.decision,null);
  assert.equal(redactMeasurement(terminal).findingCount,null);assert.equal(terminal.observation.ciAcquisition,mode==='metadata unavailable'?'unavailable':'public-job-metadata');
});

test('timed-out REST conclusions match a failure needs result without losing their exact outcome',async t=>{
  for(const stepOutcome of ['failure','cancelled','timed_out']){
    const f=metadata();f.env.REVIEW_RESULT='failure';f.job.conclusion='timed_out';f.job.steps[0].conclusion=stepOutcome;
    const checked=await retrieveCiReviewJob(f.env,f.fetchImpl);assert.equal(checked.jobOutcome,'timed_out');assert.equal(checked.stepOutcome,stepOutcome);assert.equal(checked.jobTiming.elapsedMs,10000);
    const s=storage(t,f);await collectCiMeasurement(f.env,f.fetchImpl);
    const record=loadMeasurementDirectory(s.records).records.find(r=>r.phase==='terminal');assert.equal(record.state,'incomplete');assert.equal(record.decision,null);assert.equal(record.observation.reviewJob,'timed_out');assert.equal(record.observation.jobTiming.elapsedMs,10000);const exported=redactMeasurement(record);assert.equal(exported.observation.reviewJob,'timed_out');assert.equal(exported.observation.reviewStepOutcome,stepOutcome);assert.equal(exported.observation.jobTiming.elapsedMs,10000);
  }
  const conflict=metadata();conflict.job.conclusion='timed_out';await assert.rejects(retrieveCiReviewJob(conflict.env,conflict.fetchImpl));
});

test('offset timestamps retain source text and elapsed timing across different offsets',async t=>{
  const f=metadata();f.job.started_at='2025-01-01T00:00:00-08:00';f.job.completed_at='2025-01-01T10:00:10+02:00';
  f.job.steps[0].started_at='2025-01-01T08:00:01Z';f.job.steps[0].completed_at='2025-01-01T00:00:09-08:00';
  const checked=await retrieveCiReviewJob(f.env,f.fetchImpl);assert.deepEqual(checked.jobTiming,{startedAt:f.job.started_at,completedAt:f.job.completed_at,elapsedMs:10000});assert.equal(checked.reviewTiming.elapsedMs,8000);
  const storageRoot=storage(t,f);await collectCiMeasurement(f.env,f.fetchImpl);const exported=redactMeasurement(loadMeasurementDirectory(storageRoot.records).records.find(r=>r.phase==='terminal'));assert.deepEqual(exported.observation.jobTiming,checked.jobTiming);assert.deepEqual(exported.observation.reviewTiming,checked.reviewTiming);
  for(const stamp of ['2025-02-30T00:00:00-08:00','2025-01-01T00:00:00+24:00','2025-01-01T00:00:00+02:60','2025-01-01T00:00:00']){
    const invalid=metadata();invalid.job.started_at=stamp;await assert.rejects(retrieveCiReviewJob(invalid.env,invalid.fetchImpl));
  }
});

test('exact invocation job names disambiguate reusable calls and matrix jobs without choosing an arbitrary match',async()=>{
  for(const selected of ['Gate (one) / review','Gate (two) / review']){
    const f=metadata();f.job.name='Gate (one) / review';const other=structuredClone(f.job);other.id=457;other.name='Gate (two) / review';f.data.jobs.push(other);f.data.total_count=2;
    await assert.rejects(retrieveCiReviewJob(f.env,f.fetchImpl));f.env.REVIEW_JOB_NAME=selected;
    const checked=await retrieveCiReviewJob(f.env,f.fetchImpl);assert.equal(checked.jobId,selected.includes('one')?'456':'457');
    f.env.REVIEW_JOB_NAME='Gate (unknown) / review';await assert.rejects(retrieveCiReviewJob(f.env,f.fetchImpl));
    f.env.REVIEW_JOB_NAME=selected;other.name=f.job.name;f.env.REVIEW_JOB_NAME=f.job.name;await assert.rejects(retrieveCiReviewJob(f.env,f.fetchImpl));
  }
  for(const name of [' ',String.fromCharCode(0),'\u200b','x'.repeat(257)]){
    const f=metadata();f.env.REVIEW_JOB_NAME=name;await assert.rejects(retrieveCiReviewJob(f.env,f.fetchImpl));assert.equal(f.calls.length,0);
  }
});

test('ordinary enforced collection reads only the kind from already-published validated decision output',async t=>{
  const f=metadata();delete f.env.REVIEW_DECISION_KIND;f.env.REVIEW_PUBLISHED_DECISION=JSON.stringify({decision:'PASS',findings:[{body:'private narrative'}],requestId:'private identity'});const s=storage(t,f);
  await collectCiMeasurement(f.env,f.fetchImpl);const record=loadMeasurementDirectory(s.records).records.find(r=>r.phase==='terminal');
  assert.equal(record.state,'completed');assert.deepEqual(record.decision,{decision:'PASS'});const redacted=redactMeasurement(record);assert.equal(redacted.findingCount,null);assert.equal(redacted.requestId,null);assert.ok(!JSON.stringify(record).includes('private'));
});
for(const [label,raw,kind] of [
  ['malformed','{',undefined],['duplicate keys','{"decision":"PASS","decision":"BLOCK"}',undefined],['oversized',JSON.stringify({decision:'PASS',notes:'x'.repeat(256*1024)}),undefined],
  ['invalid kind','{"decision":"unknown"}',undefined],['conflicting kind','{"decision":"BLOCK"}','PASS']
])test(`published decision ${label} remains a gap without overwriting other observations`,async t=>{
  const f=metadata();f.env.REVIEW_DECISION_KIND=kind;f.env.REVIEW_PUBLISHED_DECISION=raw;const s=storage(t,f);await collectCiMeasurement(f.env,f.fetchImpl);
  const record=loadMeasurementDirectory(s.records).records.find(r=>r.phase==='terminal');assert.equal(record.state,'incomplete');assert.equal(record.decision,null);assert.equal(record.observation.ciAcquisition,'public-job-metadata');assert.equal(record.observation.reviewTiming.elapsedMs,8000);
});
