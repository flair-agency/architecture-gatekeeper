import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {handoffOwnerAmendmentOwnerInitiated as handoff} from '../dist/owner-amendment-owner-initiated-handoff.mjs';
import {parseOwnerAmendmentSemanticTagObject} from '../dist/owner-amendment-semantic-tag-object.mjs';
const repository='flair-agency/architecture-gatekeeper',namespace='refs/tags/architecture-gatekeeper/amendments';
function fixture(profile='owner-initiated-self-v1') {
 const root=mkdtempSync(join(tmpdir(),'agk-initiated-handoff-'));
 const git=args=>execFileSync('git',['-C',root,...args],{encoding:'utf8',env:{...process.env,GIT_AUTHOR_NAME:'Test',GIT_AUTHOR_EMAIL:'test@example.test',GIT_COMMITTER_NAME:'Test',GIT_COMMITTER_EMAIL:'test@example.test'}}).trim();
 const put=(path,content)=>{mkdirSync(dirname(join(root,path)),{recursive:true});writeFileSync(join(root,path),content)};
 git(['init','-q']);
 const paths=['docs/architecture.md','docs/security.md'];
 put('.codex/gatekeeper/authorities.json',JSON.stringify({version:1,authorities:paths.map((path,i)=>({id:i?'security':'architecture',repository:'self',revision:'authority-revision',path}))}));
 put('.codex/gatekeeper/ci-policy.json',JSON.stringify({version:2,default:{mode:'local-only'},branches:{main:{mode:'enforced',model:'gpt-6.1-sol',reasoningEffort:'low',authorityManifestPath:'.codex/gatekeeper/authorities.json',authorityLimits:{maxManifestBytes:16384,maxMembers:16,maxFileBytes:65536,maxTotalBytes:262144,maxPromptBytes:524288},ownerAmendment:{version:1,grade:'G0',scope:'authority-only',triggerProfile:profile,authorityId:'architecture',authorityPath:paths[0],evidenceProducer:'github-actions-attestation',tagNamespace:namespace,maxPromptBytes:262144}}}}));
 paths.forEach(p=>put(p,`before ${p}\n`));git(['add','.']);git(['commit','-qm','base']);const baseSha=git(['rev-parse','HEAD']);
 paths.forEach(p=>put(p,`after ${p}\n`));git(['add','.']);git(['commit','-qm','B']);const bSha=git(['rev-parse','HEAD']);
 return {root,baseSha,bSha,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
function transport(f,{wrongBase=false}={}) {
 const calls=[];let tag;let ref;const objectSha='e'.repeat(40);
 const fetchImpl=async(url,init)=>{calls.push({url,init});let value;let status=200;
 if(url.endsWith('/git/ref/heads/main')) value={ref:'refs/heads/main',object:{type:'commit',sha:wrongBase?'f'.repeat(40):f.baseSha}};
 else if(url.endsWith('/rulesets/1')) value={id:1,target:'tag',enforcement:'active',bypass_actors:[],conditions:{ref_name:{include:[`${namespace}/*`],exclude:[]}},rules:[{type:'update'},{type:'deletion'}]};
 else if(url.endsWith('/git/tags')&&init.method==='POST') {const body=JSON.parse(init.body);tag={...body,sha:objectSha,object:{sha:body.object,type:'commit'}};value=tag;}
 else if(url.endsWith('/git/refs')&&init.method==='POST') {const body=JSON.parse(init.body);ref={ref:body.ref,object:{type:'tag',sha:body.sha}};value=ref;}
 else if(url.endsWith(`/git/tags/${objectSha}`)) value=tag;
 else if(url.includes('/git/ref/tags/')) {value=ref;if(!ref)status=404;}
 else throw new Error(`unexpected ${url}`);
 return {ok:status===200,status,json:()=>value};};
 return {calls,fetchImpl,getTag:()=>tag};
}
const input=f=>({repository,selfRoot:f.root,baseSha:f.baseSha,bSha:f.bSha,purpose:'Revise the existing rule',rulesetId:1,token:'synthetic-token',tagger:{name:'Test',email:'test@example.test',date:'2026-10-25T00:00:00.000Z'}});
test('owner initiated operator path derives real Git bytes and exercises actual protected tag transport/readback',async()=>{
 const f=fixture();try{const api=transport(f);const result=await handoff({...input(f),fetchImpl:api.fetchImpl});assert.equal(result.status,'OWNER_INITIATED_TAG_TRANSPORTED_AND_READ_BACK');
 assert.equal(api.calls.filter(c=>c.init.method==='POST').length,2);
 assert.equal(api.calls[0].url,'https://api.github.com/repos/flair-agency/architecture-gatekeeper/git/ref/heads/main');
 assert.equal(api.calls[0].init.redirect,'error');
 const tag=api.getTag();const tagRef=`${namespace}/${f.bSha}`;
 const parsed=parseOwnerAmendmentSemanticTagObject(Buffer.from(`object ${f.bSha}\ntype commit\ntag ${tagRef.slice(10)}\ntagger Test <test@example.test> 1 +0000\n\n${tag.message}`),{bSha:f.bSha,tagRef,triggerProfile:'owner-initiated-self-v1'});
 const record=JSON.parse(parsed.amendmentRecordBytes);assert.equal(record.historicalTrigger,'none');assert.equal(record.changes.length,2);assert.equal(Object.hasOwn(record,'triggeringReviewSha256'),false);
 assert.equal((await handoff({...input(f),fetchImpl:api.fetchImpl})).status,'OWNER_INITIATED_TAG_TRANSPORTED_AND_READ_BACK');assert.equal(api.calls.filter(c=>c.init.method==='POST').length,2);
 }finally{f.cleanup();}
});
test('stale protected base cannot mutate remote tags',async()=>{
 const f=fixture();try{const api=transport(f,{wrongBase:true});
 assert.equal((await handoff({...input(f),fetchImpl:api.fetchImpl})).status,'INCOMPLETE');assert.equal(api.calls.filter(c=>c.init.method==='POST').length,0);
 }finally{f.cleanup();}
});
test('prior completed-review profile cannot select owner initiated evidence creation',async()=>{
 const f=fixture('completed-owner-decision-self-v1');try{const api=transport(f);const result=await handoff({...input(f),fetchImpl:api.fetchImpl});assert.equal(result.status,'INCOMPLETE');assert.equal(api.calls.length,0);}finally{f.cleanup();}
});


test('caller repository values cannot alter the fixed GitHub destination', async () => {
 const f=fixture();try {
  for(const repository of ['https://attacker.invalid','flair-agency/architecture-gatekeeper/../../attacker','other/repository']) {
   const api=transport(f);
   const result=await handoff({...input(f),repository,fetchImpl:api.fetchImpl});
   assert.equal(result.status,'INCOMPLETE');
   assert.equal(api.calls.length,0);
  }
 }finally{f.cleanup();}
});
