// Investigation only: caps model dispatch; does not select or enable CI acceptance.
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { Writable } from 'node:stream';
import { mkdtempSync, mkdirSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
const bearer=process.env.PROBE_BEARER;
const project=process.env.PROBE_PROJECT;
const runtime=process.env.PROBE_CLI_ENTRYPOINT;
const parent=process.env.RUNNER_TEMP;
for(const name of ['PROBE_BEARER','PROBE_PROJECT','PROBE_CLI_ENTRYPOINT'])delete process.env[name];
if(!bearer||!runtime||!parent||! /^(?:[a-z][a-z0-9-]{4,28}[a-z0-9]|[0-9]+)$/.test(project??''))throw new Error('Missing trusted probe configuration');
const controller=new AbortController();
const originalRequest=https.request;
const observations=[];
let dispatched=0;
https.request=(options,callback)=>{
 if(dispatched>=6){
  // Cancel the whole session before any seventh HTTPS request can be created.
  controller.abort();
  const stopped=new Writable({write(_chunk,_encoding,done){done(new Error('Probe dispatch budget exhausted'));}});
  return stopped;
 }
 const observation={status:null,responseBytes:0};
 const request=originalRequest(options,response=>{
  observation.status=response.statusCode;
  response.on('data',chunk=>{observation.responseBytes+=chunk.length;});
  callback(response);
 });
 const originalWrite=request.write.bind(request);
 request.write=(chunk,...args)=>{
  // Existing proxy forwards its already validated request body in one write.
  const payload=JSON.parse(Buffer.from(chunk).toString('utf8'));
  payload.generationConfig={...payload.generationConfig,maxOutputTokens:4096};
  const boundedBody=Buffer.from(JSON.stringify(payload));
  request.setHeader('Content-Length',boundedBody.length);
  observation.requestBytes=boundedBody.length;
  observation.requestSha256=createHash('sha256').update(boundedBody).digest('hex');
  const toolOutputs=(payload.contents??[]).flatMap(item=>item.parts??[]).filter(part=>part.functionResponse).map(part=>JSON.stringify(part.functionResponse));
  for(const [index,snapshot] of snapshots.entries())if(toolOutputs.some(output=>output.includes(JSON.stringify(snapshot.text).slice(1,-1))))observedSnapshots.add(index);
  observation.observedSnapshotCount=observedSnapshots.size;
  dispatched++; observations.push(observation);
  return originalWrite(boundedBody,...args);
 };
 return request;
};
syncBuiltinESMExports();
const root=mkdtempSync(join(parent,'agk333-cli-probe-'));chmodSync(root,0o700);
for(const name of ['workspace','process'])mkdirSync(join(root,name),{mode:0o700});
const snapshots=[];const observedSnapshots=new Set();
const runnerPath=[...new Set([dirname(process.execPath),'/usr/bin','/bin'])].join(':');
const codexCheck=spawnSync('/bin/sh',['-c','command -v codex'],{env:{PATH:runnerPath},encoding:'utf8'});
const codexAbsent=[1,127].includes(codexCheck.status)&&!codexCheck.error&&!codexCheck.signal;
const openAiAbsent=!process.env.OPENAI_API_KEY&&!process.env.CODEX_API_KEY;
const limits={maxFiles:32,maxFileBytes:131072,maxTotalBytes:524288};
const reviewedSha='a2c2661988d1631dc806fa3268eb25721c3ec0fe';
let packet;let schemaText;let prompt;let provenance;let rules;let decision;let encodedPromptBytes;
const start=Date.now();let valid=false;let clean=false;let responseBytes;let responseSha256;
try{
 if(!codexAbsent||!openAiAbsent)throw new Error('Unexpected reviewer capability');
 const repositoryRoot=process.cwd();const clone=join(root,'checkout');
 execFileSync('git',['clone','--quiet','--shared',repositoryRoot,clone],{stdio:'ignore'});
 execFileSync('git',['checkout','--quiet','--detach',reviewedSha],{cwd:clone,stdio:'ignore'});
 const git=(...args)=>execFileSync('git',args,{cwd:clone,encoding:'utf8',maxBuffer:4*1024*1024});
 const [,baseSha,headSha]=git('rev-list','--parents','-n','1',reviewedSha).trim().split(' ');
 const manifestBytes=Buffer.from(git('show',`${baseSha}:.codex/gatekeeper/authorities.json`));
 const config=JSON.parse(git('show',`${baseSha}:.codex/gatekeeper/config.json`));
 const moduleAt=name=>import(pathToFileURL(join(repositoryRoot,'src',name)));
 const {materializeAuthoritySet}=await moduleAt('authority-set.mjs');
 const {prepareReviewFileContext}=await moduleAt('prepare-review-file-context.mjs');
 const {runPreparedGeminiCiReview}=await moduleAt('prepared-gemini-ci-review.mjs');
 const {validatePreparedCiDecision}=await moduleAt('prepared-ci-decision.mjs');
 const {encodeGeminiCliPromptForTransport}=await moduleAt('gemini-cli-process.mjs');
 const authority=await materializeAuthoritySet({manifestBytes,limits:config.authorityLimits,selfRepository:'flair-agency/architecture-gatekeeper',selfRoot:clone,authorityRevision:baseSha});
 provenance={version:1,manifestSha256:authority.manifestSha256,setDigest:authority.setDigest,members:authority.members.map(({content,...member})=>member)};
 packet=prepareReviewFileContext({root:clone,baseSha,headSha,reviewedSha,referencePaths:authority.members.map(member=>member.path),limits});
 snapshots.push(...packet.files.flatMap(file=>[file.before,file.after]).filter(Boolean));
 schemaText=git('show',`${baseSha}:.codex/gatekeeper/ci-decision.schema.json`);
 rules=JSON.parse(git('show',`${baseSha}:.codex/gatekeeper/decision.validation.json`));
 const context='Investigation only: review this actual historical merge; do not authorize acceptance or claim deployment. The materialized manifest.json binds the exact base/head/merge tuple and maps original paths to evidence filenames. Read manifest.json and ALL before/after snapshots listed under files with read_file; batch read_file calls when useful. The six protected reference members are appended in full below, so do not reload them as workspace instructions. Review only the selected changed scope, record missing evidence, and return only the selected JSON decision schema. Do not guess conformance or treat absent tools as proof of host isolation.';
 prompt=context+'\n\n'+git('show',`${baseSha}:.codex/gatekeeper/ci-prompt.md`)+'\n\n'+authority.prompt;
 encodedPromptBytes=Buffer.byteLength(encodeGeminiCliPromptForTransport(prompt+'\n\nProtected output schema (follow this schema exactly; downstream CI validation remains authoritative):\n'+schemaText+'\n'));
 const response=await runPreparedGeminiCiReview({protectedPromptText:prompt,protectedDecisionSchemaText:schemaText,proxySessionOptions:{packet,workspaceLimits:limits,workspaceParentDirectory:join(root,'workspace'),credentials:{type:'bearer',value:bearer},processOptions:{cliEntrypoint:runtime,privateParentDirectory:join(root,'process'),model:'gemini-3.8-flash',thinkingLevel:'MEDIUM',project,region:'global',timeoutMs:180000,maxPromptBytes:524288,maxStdoutBytes:65536,maxStderrBytes:65536,signal:controller.signal}}});
 decision=validatePreparedCiDecision({responseBytes:response,schemaBytes:schemaText,authorityProvenance:provenance,validationRules:rules,maxResponseBytes:65536,maxSchemaBytes:1048576});
 valid=observedSnapshots.size===snapshots.length;
 responseBytes=Buffer.byteLength(response);responseSha256=createHash('sha256').update(response).digest('hex');
}catch{ /* Publish no provider, CLI, path or credential error details. */ }
finally{
 clean=readdirSync(join(root,'workspace')).length===0&&readdirSync(join(root,'process')).length===0;
 rmSync(root,{recursive:true,force:true});
 https.request=originalRequest;syncBuiltinESMExports();
}
console.log(JSON.stringify({kind:'historical-complete-input-review-investigation-not-acceptance',revision:process.env.GITHUB_SHA,reviewedMerge:reviewedSha,base:packet?.revisions.baseSha,head:packet?.revisions.headSha,authoritySetDigest:provenance?.setDigest,model:'gemini-3.8-flash',thinkingLevel:'MEDIUM',location:'global',maxModelRequests:6,maxOutputTokensPerRequest:4096,sessionDeadlineMs:180000,elapsedMs:Date.now()-start,packetBytes:packet?Buffer.byteLength(JSON.stringify(packet)):null,encodedSelectedPromptBytes:encodedPromptBytes,responseBytes,responseSha256,changedPaths:packet?.files.length,authorityMembers:packet?.references.length,expectedSnapshotCount:snapshots.length,observedSnapshotCount:observedSnapshots.size,validatedDecision:decision?.decision,gateDecisions:decision?{sharedMechanism:decision.gates.sharedMechanism.decision,trustBoundary:decision.gates.trustBoundary.decision}:null,findingCount:decision?.findings.length,completeValidatedReview:valid,sessionResourcesCleaned:clean,codexAbsentFromRunnerPath:codexAbsent,codexLookupStatus:codexCheck.status,openAiCredentialsAbsent:openAiAbsent,modelRequests:observations}));
if(!valid||!clean)process.exitCode=1;
