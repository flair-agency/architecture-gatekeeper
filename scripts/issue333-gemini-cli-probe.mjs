// Investigation only: caps model dispatch; does not select or enable CI acceptance.
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { Writable } from 'node:stream';
import { mkdtempSync, mkdirSync, chmodSync, rmSync, readdirSync } from 'node:fs';
import { createHash, randomBytes } from 'node:crypto';
import { join } from 'node:path';
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
 if(dispatched>=4){
  // Cancel the whole session before any fifth HTTPS request can be created.
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
  payload.generationConfig={...payload.generationConfig,maxOutputTokens:1024};
  const boundedBody=Buffer.from(JSON.stringify(payload));
  request.setHeader('Content-Length',boundedBody.length);
  observation.requestBytes=boundedBody.length;
  observation.requestSha256=createHash('sha256').update(boundedBody).digest('hex');
  observation.evidenceReturned=JSON.stringify(payload.contents).includes(sentinel)&&JSON.stringify(payload.contents).includes('functionResponse');
  dispatched++; observations.push(observation);
  return originalWrite(boundedBody,...args);
 };
 return request;
};
syncBuiltinESMExports();
const root=mkdtempSync(join(parent,'agk333-cli-probe-'));chmodSync(root,0o700);
for(const name of ['workspace','process'])mkdirSync(join(root,name),{mode:0o700});
const sentinel=`AGK_${randomBytes(16).toString('hex')}`;
const text=`Synthetic transport evidence only. Evidence sentinel: ${sentinel}. No acceptance authority.`;
const limits={maxFiles:2,maxFileBytes:2048,maxTotalBytes:8192};
const schema={type:'object',required:['decision','sentinel'],additionalProperties:false,properties:{decision:{type:'string',enum:['PASS']},sentinel:{type:'string'}}};
const packet={version:1,revisions:{baseSha:'a'.repeat(40),headSha:'b'.repeat(40),reviewedMergeSha:'c'.repeat(40)},limits,files:[],references:[{path:'docs/synthetic-authority.md',text,mode:'100644',gitObjectId:'d'.repeat(40),sha256:createHash('sha256').update(text).digest('hex')}]};
const start=Date.now();let valid=false;let clean=false;
try{
 const {runPreparedGeminiCiReview}=await import(pathToFileURL(join(process.cwd(),'src/prepared-gemini-ci-review.mjs')));
 const {validateJsonSchema}=await import(pathToFileURL(join(process.cwd(),'src/json-schema.mjs')));
 const response=await runPreparedGeminiCiReview({protectedPromptText:'Synthetic transport investigation only. Read manifest.json and every listed reference file with read_file. Return exactly a JSON object containing decision PASS and the evidence sentinel you read. Do not execute commands. Do not guess a sentinel.',protectedDecisionSchemaText:JSON.stringify(schema),proxySessionOptions:{packet,workspaceLimits:limits,workspaceParentDirectory:join(root,'workspace'),credentials:{type:'bearer',value:bearer},processOptions:{cliEntrypoint:runtime,privateParentDirectory:join(root,'process'),model:'gemini-3.8-flash',thinkingLevel:'MEDIUM',project,region:'global',timeoutMs:120000,maxPromptBytes:8192,maxStdoutBytes:65536,maxStderrBytes:65536,signal:controller.signal}}});
 const decision=validateJsonSchema(JSON.parse(response),schema);
 valid=decision.sentinel===sentinel&&observations.some(value=>value.evidenceReturned);
}catch{ /* Publish no provider, CLI, path or credential error details. */ }
finally{
 clean=readdirSync(join(root,'workspace')).length===0&&readdirSync(join(root,'process')).length===0;
 rmSync(root,{recursive:true,force:true});
 https.request=originalRequest;syncBuiltinESMExports();
}
console.log(JSON.stringify({kind:'synthetic-cli-connectivity-not-review-quality-or-acceptance',revision:process.env.GITHUB_SHA,model:'gemini-3.8-flash',thinkingLevel:'MEDIUM',location:'global',maxModelRequests:4,maxOutputTokensPerRequest:1024,sessionDeadlineMs:120000,elapsedMs:Date.now()-start,packetBytes:Buffer.byteLength(JSON.stringify(packet)),validatedSyntheticResponse:valid,sessionResourcesCleaned:clean,modelRequests:observations}));
if(!valid||!clean)process.exitCode=1;
