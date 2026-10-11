import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, linkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateCodexPass } from '../dist/ci-review/codex-pass-producer.mjs';
import { CODEX_PASS_FRAME, CODEX_PASS_STEP, createPassDisplay, emitPassDisplay, parsePassLog } from '../dist/ci-review/codex-pass-publication.mjs';
import { retrievePassDisplay } from '../dist/github/codex-pass-log.mjs';
import { classifyReview, digestDecision, loadCodexPassReport, renderReport } from '../dist/ci-report.mjs';
import { assertEnforcedAcceptance } from '../dist/ci-enforced-acceptance.mjs';
const repository = 'flair-agency/architecture-gatekeeper';
const context = { repository,runId:'123',runAttempt:'2',eventSha:'a'.repeat(40),callerWorkflowSha:'a'.repeat(40),
  callerWorkflowRef:`${repository}/.github/workflows/self-architecture-gate.yml@refs/heads/main`,
  workflowRepository:repository,workflowSha:'a'.repeat(40),workflowRef:`${repository}/.github/workflows/architecture-gate.yml@refs/heads/main`,
  baseSha:'a'.repeat(40),headSha:'b'.repeat(40),reviewedSha:'c'.repeat(40) };
const ids = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/authorities.json',import.meta.url))).authorities.map(x=>x.id);
const provenance = { version:1, manifestSha256:'d'.repeat(64),setDigest:'e'.repeat(64),
  members:ids.map(id=>({id,repository,resolvedCommit:context.baseSha,path:`docs/${id}.md`,sha256:'f'.repeat(64)})) };
const schema = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/ci-decision.schema.json',import.meta.url)));
const rulesText = readFileSync(new URL('../.codex/gatekeeper/decision.validation.json',import.meta.url),'utf8');
function valueFor(s) {
  if (s.enum) return s.enum.includes('PASS') ? 'PASS' : s.enum[0];
  if (s.type === 'object') return Object.fromEntries(s.required.map(k=>[k,valueFor(s.properties[k])]));
  if (s.type === 'array') return s.minItems ? [valueFor(s.items)] : [];
  if (s.type === 'integer') return 1;
  return 'bounded claim';
}
function decision() { const d=valueFor(schema); d.authorityIds=ids; return d; }
function input(d=decision(), overrides={}) {
  return {context,decisionText:JSON.stringify(d),schemaText:JSON.stringify(schema),rulesText,
    authorityText:JSON.stringify(provenance),authorityEncoded:Buffer.from(JSON.stringify(provenance)).toString('base64'),
    legacyText:null,legacyEncoded:'',policyVersion:'2',mode:'enforced',policyResult:'success',reviewResult:'success',...overrides};
}
function publication() { return validateCodexPass(input()); }
function frame(p) { let text='';emitPassDisplay(p.projection,x=>{text+=x});return text; }
function env(p) { return {MODE:'enforced',POLICY_RESULT:'success',REVIEW_RESULT:'success',GITHUB_EVENT_NAME:'pull_request_target',BASE_BRANCH:'main',
  CODEX_PASS_ELIGIBLE:'true',CODEX_PASS_SELECTED:'true',CODEX_PASS_KIND:'PASS',CODEX_PASS_CONCLUSION:'PASS',
  CODEX_PASS_DIGEST:p.expected.decisionDigest,CODEX_PASS_NONCE:p.expected.nonce,GITHUB_TOKEN:'fixture-token',
  GITHUB_REPOSITORY:context.repository,GITHUB_RUN_ID:context.runId,GITHUB_RUN_ATTEMPT:context.runAttempt,GITHUB_SHA:context.eventSha,
  GITHUB_WORKFLOW_SHA:context.callerWorkflowSha,GITHUB_WORKFLOW_REF:context.callerWorkflowRef,
  GATEKEEPER_WORKFLOW_REPOSITORY:context.workflowRepository,GATEKEEPER_WORKFLOW_SHA:context.workflowSha,GATEKEEPER_WORKFLOW_REF:context.workflowRef,
  BASE_SHA:context.baseSha,HEAD_SHA:context.headSha,REVIEWED_SHA:context.reviewedSha,OWNER_AMENDMENT_SELECTED:'G0'}; }
function host(p, mutate=()=>{}, options={}) {
  const run={id:123,event:'pull_request_target',run_attempt:2,repository:{full_name:repository},head_sha:context.headSha,path:'.github/workflows/self-architecture-gate.yml',
    referenced_workflows:[{sha:context.workflowSha,path:`${repository}/.github/workflows/architecture-gate.yml@${context.workflowSha}`,ref:'refs/heads/main'}]};
  const job={id:321,run_id:123,run_attempt:2,head_sha:context.headSha,status:'completed',conclusion:'success',
    steps:[{name:CODEX_PASS_STEP,status:'completed',conclusion:'success'}]};
  const jobs={total_count:1,jobs:[job]};const data={run,jobs,job};mutate(data);const calls=[];
  const fetchImpl=async(url,init)=>{calls.push({url:String(url),init});
    if(String(url).endsWith('/attempts/2')) return Response.json(run);
    if(String(url).endsWith('/jobs?per_page=100'))return Response.json(jobs);
    if(options.redirect && String(url).includes('/jobs/321/logs'))return new Response(null,{status:302,headers:{location:options.redirect}});
    return new Response(options.log ?? frame(p));};
  return {fetchImpl,calls};
}

test('original complete main schema, consumer rules and six authority checks precede PASS metadata',()=>{
  const p=publication();assert.equal(p.expected.decisionDigest,digestDecision(decision()));
  assert.equal(parsePassLog(frame(p),p.expected).decision,'PASS');
  for(const bad of [d=>{delete d.summary},d=>{d.gates.trustBoundary.decision='BLOCK'},d=>{d.authorityIds=ids.slice(1)},
    d=>{d.authorityIds=[...ids,'extra']},d=>{d.authorityIds=[ids[0],...ids.slice(0,-1)]}]) {
    const d=decision();bad(d);assert.throws(()=>validateCodexPass(input(d)));
  }
  for(const overrides of [{decisionText:'{"decision":"PASS","decision":"PASS"}'},{decisionText:'{'},
    {decisionText:'x'.repeat(65_537)},{schemaText:'{"type":"array"}'}, {authorityEncoded:''},
    {authorityText:JSON.stringify({...provenance,setDigest:'0'.repeat(64)})},{reviewResult:'failure'},{policyResult:'failure'}]) {
    assert.throws(()=>validateCodexPass(input(decision(),overrides)));
  }
});

test('nonPASS and nested BLOCK governance classification retains original route semantics',()=>{
  for(const kind of ['BLOCK','OWNER_DECISION']){const d=decision();d.decision=kind;assert.equal(validateCodexPass(input(d)),null);}
  const result=classifyReview({mode:'enforced',policyResult:'success',reviewResult:'success',rawDecision:JSON.stringify({decision:'OWNER_DECISION',ownerDecisionId:'id',gates:{g:{decision:'BLOCK'}}}),
    ownerAdditionSelected:true,ownerAdditionResult:'success',ownerAdditionEligibility:'ELIGIBLE',
    ownerAdditionProcedure:{procedure:'VALID_G0_OWNER_ADDITION',missingDecisionId:'id'}});
  assert.equal(result.conclusion,'OWNER_DECISION');
  assert.throws(()=>createPassDisplay(context,{decision:'BLOCK'},'f'.repeat(64)));
});

test('runner masking affects structured display only, while canonical original digest and selected G0 guards persist',async()=>{
  const d=decision();d.summary='synthetic-mask-marker';const p=validateCodexPass(input(d));
  const masked=frame(p).replaceAll('synthetic-mask-marker','***');
  const {fetchImpl,calls}=host(p,()=>{},{log:masked});
  const report=await loadCodexPassReport(env(p),fetchImpl);
  assert.equal(report.decision.summary,'***');assert.equal(report.decisionDigest,digestDecision(d));
  assert.notEqual(digestDecision(report.decision),report.decisionDigest);
  const rendered=renderReport({conclusion:'PASS',summary:report.decision.summary,decision:report.decision},{decisionDigest:report.decisionDigest});
  assert.match(rendered,/\*\*\*/);assert.ok(rendered.includes(report.decisionDigest));
  assert.equal(assertEnforcedAcceptance({reviewResult:'success',conclusion:'PASS',ownerAmendmentSelected:'G0',
    ownerAmendmentAttemptResult:'success',ownerAmendmentAttempted:'false'}).route,'ordinary-pass');
  for(const attempted of ['true',undefined])assert.throws(()=>assertEnforcedAcceptance({reviewResult:'success',conclusion:'PASS',
    ownerAmendmentSelected:'G0',ownerAmendmentAttemptResult:'success',ownerAmendmentAttempted:attempted}));
  assert.ok(calls.every(x=>x.url.startsWith('https://api.github.com/')));
});

test('selected projection never falls back to valid raw PASS when metadata is missing or forged',async()=>{
  const p=publication();for(const key of ['CODEX_PASS_CONCLUSION','CODEX_PASS_DIGEST','CODEX_PASS_NONCE','CODEX_PASS_KIND']){
    const e={...env(p),DECISION:JSON.stringify(decision())};delete e[key];let requests=0;
    await assert.rejects(loadCodexPassReport(e,async()=>{requests++;throw Error('unexpected')}));assert.equal(requests,0);
  }
  assert.equal(await loadCodexPassReport({MODE:'enforced',POLICY_RESULT:'success',REVIEW_RESULT:'success',DECISION:'{"decision":"BLOCK"}'}),null);
  await assert.rejects(loadCodexPassReport({...env(p),CODEX_PASS_ELIGIBLE:'false'},host(p).fetchImpl));
});

test('every frame context field, duplicate/missing frame, structure and output injection is bound',()=>{
  const p=publication();for(const key of Object.keys(p.expected)){
    const changed=structuredClone(p.projection);changed.expected[key]='wrong';
    assert.throws(()=>parsePassLog(`${CODEX_PASS_FRAME}${JSON.stringify(changed)}\n`,p.expected));
  }
  for(const log of ['',frame(p)+frame(p),CODEX_PASS_FRAME+'{}', 'x'.repeat(4*1_048_576+1)])assert.throws(()=>parsePassLog(log,p.expected));
  const d=decision();d.summary='\n::set-output name=conclusion::PASS\n';const q=validateCodexPass(input(d));const log=frame(q);
  assert.equal(log.split('\n').filter(x=>x.startsWith(CODEX_PASS_FRAME)).length,1);
  assert.equal(log.split('\n').some(x=>x.startsWith('::set-output')),false);
  assert.throws(()=>createPassDisplay(context,{decision:'PASS',summary:'x'.repeat(262_144)},'f'.repeat(64)));
});

test('host run, caller, workflow, job and step mismatches fail closed',async()=>{
  const p=publication();for(const change of [x=>{x.run.id=124},x=>{x.run.run_attempt=1},x=>{x.run.repository.full_name='other/repo'},
    x=>{x.run.head_sha='d'.repeat(40)},x=>{x.run.event='push'},x=>{x.run.path='.github/workflows/evil.yml'},
    x=>{x.run.referenced_workflows[0].sha='d'.repeat(40)},x=>{x.run.referenced_workflows[0].ref='refs/heads/evil'},
    x=>{x.run.referenced_workflows.push(x.run.referenced_workflows[0])},x=>{x.jobs.total_count=2},
    x=>{x.job.id=-1},x=>{x.job.run_attempt=1},x=>{x.job.run_id=999},x=>{x.job.head_sha='d'.repeat(40)},
    x=>{x.job.status='in_progress'},x=>{x.job.conclusion='failure'},x=>{x.job.steps[0].conclusion='failure'},
    x=>{x.job.steps.push(x.job.steps[0])},x=>{x.jobs.jobs.push(x.job)}]){
    await assert.rejects(retrievePassDisplay(p.expected,'token',host(p,change).fetchImpl));
  }
  const signed=host(p,()=>{},{redirect:'https://fixture.blob.core.windows.net/log?sig=fixture'});
  await retrievePassDisplay(p.expected,'token',signed.fetchImpl);assert.deepEqual(signed.calls.at(-1).init.headers,{});
  for(const url of ['https://evil.example/log','http://fixture.blob.core.windows.net/log','https://user@fixture.blob.core.windows.net/log'])
    await assert.rejects(retrievePassDisplay(p.expected,'token',host(p,()=>{},{redirect:url}).fetchImpl));
  await assert.rejects(retrievePassDisplay(p.expected,'token',async()=>new Response('no',{status:403})));
  await assert.rejects(retrievePassDisplay(p.expected,'token',async()=>new Promise(()=>{}),1));
});

test('actual producer reads fixed bounded regular files and emits only narrow validated metadata',()=>{
  const dir=mkdtempSync(join(tmpdir(),'codex-pass-'));const command=new URL('../dist/ci-review/codex-pass-producer.mjs',import.meta.url);
  const p=publication();const e={...process.env,...env(p),RUNNER_TEMP:dir,GITHUB_OUTPUT:join(dir,'output'),PROTECTED_INSTRUCTIONS:'true',
    VALIDATION_SELECTED:'true',AUTHORITY_ROUTE_SELECTED:'true',POLICY_VERSION:'2',
    AUTHORITY_PROVENANCE_BASE64:input().authorityEncoded,LEGACY_AUTHORITY_PROVENANCE_BASE64:'',GATEKEEPER_RUNTIME_ROOT:''};
  const run=()=>spawnSync(process.execPath,[command.pathname],{cwd:dir,env:e,encoding:'utf8'});
  try{
    mkdirSync(join(dir,'architecture-gate-authority-set'));writeFileSync(join(dir,'architecture-gate-authority-set/authority-provenance.json'),input().authorityText);
    writeFileSync(join(dir,'architecture-gate-decision.schema.json'),JSON.stringify(schema));writeFileSync(join(dir,'architecture-gate-decision.validation.json'),rulesText);
    writeFileSync(e.GITHUB_OUTPUT,'');const path=join(dir,'architecture-gate-codex-final.json');writeFileSync(path,input().decisionText);
    const ok=run();assert.equal(ok.status,0,ok.stderr);assert.match(ok.stdout,/AGK_CODEX_PASS_DISPLAY_V1/);
    const metadata=readFileSync(e.GITHUB_OUTPUT,'utf8');assert.match(metadata,/^pass_conclusion=PASS\npass_digest=[a-f0-9]{64}\npass_nonce=[a-f0-9]{48}\n$/);
    for(const kind of ['BLOCK','OWNER_DECISION']){
      const d=decision();d.decision=kind;writeFileSync(path,JSON.stringify(d));writeFileSync(e.GITHUB_OUTPUT,'');
      const nonpass=run();assert.equal(nonpass.status,0,nonpass.stderr);assert.equal(nonpass.stdout,'');assert.equal(readFileSync(e.GITHUB_OUTPUT,'utf8'),'');
    }
    writeFileSync(path,input().decisionText);
    for(const setup of [()=>writeFileSync(path,'{'),()=>{rmSync(path);symlinkSync(join(dir,'architecture-gate-decision.schema.json'),path)},
      ()=>{rmSync(path);linkSync(join(dir,'architecture-gate-decision.schema.json'),path)},()=>{rmSync(path)}]){
      writeFileSync(e.GITHUB_OUTPUT,'');setup();const bad=run();assert.notEqual(bad.status,0);assert.equal(readFileSync(e.GITHUB_OUTPUT,'utf8'),'');
      rmSync(path,{force:true});writeFileSync(path,input().decisionText);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});


test('pure direct-source fixture binds actual push source; production reporter cannot select fixture context',async()=>{
  const c={...context,workflowSha:context.headSha,callerWorkflowSha:context.headSha,eventSha:context.headSha,
    callerWorkflowRef:`${repository}/.github/workflows/fixture.yml@refs/heads/fixture`,
    workflowRef:`${repository}/.github/workflows/fixture.yml@refs/heads/fixture`};
  const p=createPassDisplay(c,decision(),digestDecision(decision()));
  const h=host(p,x=>{x.run.event='push';x.run.path='.github/workflows/fixture.yml';delete x.run.referenced_workflows});
  assert.equal((await retrievePassDisplay(p.expected,'token',h.fetchImpl)).decision,'PASS');
  await assert.rejects(retrievePassDisplay({...p.expected,eventSha:context.baseSha},'token',h.fetchImpl));
  await assert.rejects(retrievePassDisplay({...p.expected,callerWorkflowSha:context.baseSha},'token',h.fetchImpl));
  await assert.rejects(retrievePassDisplay({...p.expected,workflowRepository:'foreign/repo'},'token',h.fetchImpl));
  await assert.rejects(retrievePassDisplay(p.expected,'token',host(p,x=>{x.run.event='push';x.run.path='.github/workflows/fixture.yml'}).fetchImpl));
  const e={...env(p),GITHUB_WORKFLOW_SHA:c.callerWorkflowSha,GITHUB_WORKFLOW_REF:c.callerWorkflowRef,
    GATEKEEPER_WORKFLOW_SHA:c.workflowSha,GATEKEEPER_WORKFLOW_REF:c.workflowRef,GITHUB_SHA:c.eventSha};
  await assert.rejects(loadCodexPassReport(e,h.fetchImpl));
});

test('legacy exact files and original provenance are required before metadata',()=>{
  const legacy={version:1,baseSha:context.baseSha,headSha:context.headSha,reviewedSha:context.reviewedSha,
    policy:{path:'.codex/gatekeeper/ci-policy.json',sha256:'a'.repeat(64)},prompt:{path:'.codex/gatekeeper/ci-prompt.md',sha256:'b'.repeat(64)},
    schema:{path:'.codex/gatekeeper/ci-decision.schema.json',sha256:'c'.repeat(64)},validation:null,
    members:[{path:'docs/architecture.md',sha256:'d'.repeat(64)}]};
  const d=decision();d.authorityFiles=['docs/architecture.md'];
  const overrides={policyVersion:'1',authorityText:null,authorityEncoded:'',legacyText:JSON.stringify(legacy),
    legacyEncoded:Buffer.from(JSON.stringify(legacy)).toString('base64')};
  assert.equal(validateCodexPass(input(d,overrides)).expected.conclusion,'PASS');
  for(const bad of [{legacyText:null},{legacyEncoded:''},{legacyText:'{}'},
    {legacyText:JSON.stringify({...legacy,headSha:'d'.repeat(40)})},
    {legacyText:JSON.stringify({...legacy,members:[]})}])assert.throws(()=>validateCodexPass(input(d,{...overrides,...bad})));
  d.authorityFiles=['docs/wrong.md'];assert.throws(()=>validateCodexPass(input(d,overrides)));
});

test('actual reporter CLI requires structured masked display and original canonical digest before output',()=>{
  const dir=mkdtempSync(join(tmpdir(),'codex-pass-report-'));const p=publication();
  const masked=frame(p).replaceAll('bounded claim','***');
  const run={id:123,event:'pull_request_target',run_attempt:2,repository:{full_name:repository},head_sha:context.headSha,
    path:'.github/workflows/self-architecture-gate.yml',referenced_workflows:[{sha:context.workflowSha,
      path:`${repository}/.github/workflows/architecture-gate.yml@${context.workflowSha}`,ref:'refs/heads/main'}]};
  const jobs={total_count:1,jobs:[{id:321,run_id:123,run_attempt:2,head_sha:context.headSha,status:'completed',conclusion:'success',
    steps:[{name:CODEX_PASS_STEP,status:'completed',conclusion:'success'}]}]};
  const shim=join(dir,'fetch.mjs');writeFileSync(shim,`globalThis.fetch=async(url,init)=>{
    const u=String(url); if(u.endsWith('/attempts/2'))return Response.json(${JSON.stringify(run)});
    if(u.endsWith('/jobs?per_page=100'))return Response.json(${JSON.stringify(jobs)});
    if(u.endsWith('/logs'))return new Response(${JSON.stringify(masked)});
    if(init?.method==='POST')return Response.json({id:1});return Response.json([]);
  };`);
  const e={...process.env,...env(p),AUTHORITY_ROUTE_SELECTED:'true',AUTHORITY_PROVENANCE_BASE64:input().authorityEncoded,
    LEGACY_AUTHORITY_PROVENANCE_BASE64:'',POLICY_VERSION:'2',PR_NUMBER:'1',DECISION:'',OWNER_ADDITION_SELECTED:'false',
    GITHUB_OUTPUT:join(dir,'output'),GITHUB_STEP_SUMMARY:join(dir,'summary'),REPORT_PATH:join(dir,'report')};
  const command=new URL('../dist/ci-report.mjs',import.meta.url).pathname;
  const invoke=()=>spawnSync(process.execPath,['--import',shim,command],{env:e,encoding:'utf8'});
  try{
    writeFileSync(e.GITHUB_OUTPUT,'');writeFileSync(e.GITHUB_STEP_SUMMARY,'');
    const ok=invoke();assert.equal(ok.status,0,ok.stderr);
    assert.equal(readFileSync(e.GITHUB_OUTPUT,'utf8'),`conclusion=PASS\ndecision_digest=${p.expected.decisionDigest}\n`);
    assert.match(readFileSync(e.REPORT_PATH,'utf8'),/\*\*\*/);
    assert.ok(readFileSync(e.REPORT_PATH,'utf8').includes(p.expected.decisionDigest));
    delete e.CODEX_PASS_NONCE;writeFileSync(e.GITHUB_OUTPUT,'');writeFileSync(e.GITHUB_STEP_SUMMARY,'');rmSync(e.REPORT_PATH);
    const bad=invoke();assert.notEqual(bad.status,0);assert.equal(readFileSync(e.GITHUB_OUTPUT,'utf8'),'');assert.equal(readFileSync(e.GITHUB_STEP_SUMMARY,'utf8'),'');
    assert.throws(()=>readFileSync(e.REPORT_PATH));
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('bounded log streams reject declared/actual oversize and malformed UTF-8 before returning display',async()=>{
  const p=publication();for(const make of [()=>new Response('x',{headers:{'content-length':String(4*1_048_576+1)}}),
    ()=>new Response(new Uint8Array([255]))]){
    const h=host(p);await assert.rejects(retrievePassDisplay(p.expected,'token',(url,init)=>String(url).endsWith('/logs')?Promise.resolve(make()):h.fetchImpl(url,init)));
  }
  let canceled=false;const h=host(p);
  await assert.rejects(retrievePassDisplay(p.expected,'token',(url,init)=>String(url).endsWith('/logs') ? Promise.resolve(new Response(new ReadableStream({
    start(c){c.enqueue(new Uint8Array(4*1_048_576+1));},cancel(){canceled=true;}
  }))) : h.fetchImpl(url,init)));
  assert.equal(canceled,true);
});

// Identity fields independently read from the public run/attempt-job APIs for
// #528. Only the PASS step/frame below is synthetic: the historic run was BLOCK.
test('observed pull_request_target API identities bind PR head, separately from execution base',async()=>{
  const base='e22d46867f21980b978b5cd75c279f7a4f2aa1da';
  const head='5ddb96f276adbbbe6ff67163acc993e561979cc7';
  const observedRun={id:38157015446,event:'pull_request_target',run_attempt:1,
    repository:{full_name:repository},head_sha:head,path:'.github/workflows/self-architecture-gate.yml',
    pull_requests:[{number:528,base:{sha:base},head:{sha:head}}],
    referenced_workflows:[{path:`${repository}/.github/workflows/architecture-gate.yml@${base}`,sha:base,ref:'refs/heads/main'}]};
  const observedJob={id:114522052692,run_id:38157015446,run_attempt:1,head_sha:head,name:'architecture-gate / review'};
  const actualIdentityContext={...context,runId:String(observedRun.id),runAttempt:'1',
    eventSha:base,baseSha:base,headSha:head,callerWorkflowSha:base,workflowSha:base,
    workflowRef:`${repository}/.github/workflows/architecture-gate.yml@refs/heads/main`};
  // reviewedSha and the validated decision/publication are synthetic, not a
  // claim about the historic reviewed merge or its protected BLOCK conclusion.
  const p=validateCodexPass(input(decision(),{context:actualIdentityContext}));
  assert.notEqual(p.expected.eventSha,p.expected.headSha);
  assert.equal(p.expected.workflowSha,observedRun.pull_requests[0].base.sha);
  async function retrieve(mutate=()=>{}) {
    const run=structuredClone(observedRun);
    const job={...observedJob,status:'completed',conclusion:'success',
      steps:[{name:CODEX_PASS_STEP,status:'completed',conclusion:'success'}]};
    mutate(run,job);
    const fetchImpl=async(url)=>{
      const path=new URL(url).pathname;
      if(path===`/repos/${repository}/actions/runs/38157015446/attempts/1`)return Response.json(run);
      if(path===`/repos/${repository}/actions/runs/38157015446/attempts/1/jobs`)return Response.json({total_count:1,jobs:[job]});
      assert.equal(path,`/repos/${repository}/actions/jobs/114522052692/logs`);
      return new Response(frame(p));
    };
    return retrievePassDisplay(p.expected,'synthetic-token',fetchImpl);
  }
  assert.equal((await retrieve()).decision,'PASS');
  await assert.rejects(retrieve(run=>{run.head_sha=base}));
  await assert.rejects(retrieve((_run,job)=>{job.head_sha=base}));
});
