import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildOwnerAmendmentOwnerInitiatedAmendmentRecord as build, validateOwnerAmendmentOwnerInitiatedAmendmentRecord as validate } from '../dist/owner-amendment-owner-initiated-record.mjs';
import { parseOwnerAmendmentSemanticTagObject as parseTag } from '../dist/owner-amendment-semantic-tag-object.mjs';
const sha = x => createHash('sha256').update(x).digest('hex');
const repository = 'flair-agency/architecture-gatekeeper', baseSha = 'a'.repeat(40), bSha = 'b'.repeat(40);
const paths = ['docs/architecture.md', 'docs/security.md'];
const changes = paths.map(path => ({path, beforeBytes: Buffer.from(`before ${path}`), afterBytes: Buffer.from(`after ${path}`)}));
const members = changes.map((c,i) => ({ id: i ? 'security' : 'architecture', repository, resolvedCommit: baseSha, path:c.path, byteLength:c.beforeBytes.length, sha256:sha(c.beforeBytes)}));
const priorAuthoritySetDigest = sha(JSON.stringify(members));
const resultingAuthoritySetDigest = sha(JSON.stringify(members.map((m,i)=>({...m,byteLength:changes[i].afterBytes.length,sha256:sha(changes[i].afterBytes)}))));
const input = { authority: {version:1,selfRepository:repository,authorityRevision:baseSha,manifestSha256:sha('manifest'),setDigest:priorAuthoritySetDigest,members}, repository,baseSha,bSha,authorityId:'architecture',authorityPath:paths[0],previousAuthorityBytes:changes[0].beforeBytes,amendedAuthorityBytes:changes[0].afterBytes,authorityChanges:changes,priorAuthoritySetDigest,resultingAuthoritySetDigest,purpose:'Revise the existing decision 日本語'};
const expected = {repository,baseSha,bSha,policyRevision:baseSha,triggerProfile:'owner-initiated-self-v1',historicalTrigger:'none',authoritySetDigest:priorAuthoritySetDigest,resultingAuthoritySetDigest,authorityId:'architecture',authorityPath:paths[0],changes:changes.map(c=>({path:c.path,beforeSha256:sha(c.beforeBytes),afterSha256:sha(c.afterBytes)}))};
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
const bytes = x => Buffer.from(`${JSON.stringify(canonical(x))}\n`);
test('owner initiated record binds complete Set changes without historical evidence',()=>{
 const result=build(input); assert.deepEqual(result.bytes,bytes(result.record));
 const checked=validate({bytes:result.bytes,expected});assert.equal(checked.status,'VERIFIED_OWNER_AMENDMENT_RECORD');assert.equal(checked.historicalTrigger,'none');
 assert.equal(Object.hasOwn(result.record,'triggeringReviewSha256'),false);
 for(const patch of [{authorityId:'unselected'},{resultingAuthoritySetDigest:sha('wrong')},{authorityChanges:changes.slice(0,1)},{authorityChanges:[...changes].reverse()},{authority:{...input.authority,members:members.slice(1)}}]) assert.throws(()=>build({...input,...patch}));
});
test('record rejects mixed profiles, duplicate keys, noncanonical bytes and changed bindings',()=>{
 const built=build(input);
 for(const patch of [{triggeringReviewSha256:sha('fake')},{historicalTrigger:null},{version:2},{triggerProfile:'completed-owner-decision-self-v1'},{purpose:''}]) assert.equal(validate({bytes:bytes({...built.record,...patch}),expected}).status,'INCOMPLETE');
 for(const malformed of [Buffer.from(`${built.bytes.toString().trim()} `),Buffer.from(built.bytes.toString().replace('"version":1','"version":1,"version":1')),Buffer.from([0xff])]) assert.equal(validate({bytes:malformed,expected}).status,'INCOMPLETE');
 assert.equal(validate({bytes:built.bytes,expected:{...expected,bSha:'c'.repeat(40)}}).status,'INCOMPLETE');
});
test('v4 annotated tag only admits canonical absent-history envelope',()=>{
 const built=build(input),tagRef=`refs/tags/architecture-gatekeeper/amendments/${bSha}`;
 const envelope={version:4,profile:'self-g0',triggerProfile:'owner-initiated-self-v1',historicalTrigger:'none',bSha,amendmentRecordBase64:built.bytes.toString('base64'),amendmentRecordSha256:sha(built.bytes)};
 const object=e=>Buffer.concat([Buffer.from(`object ${bSha}\ntype commit\ntag ${tagRef.slice(10)}\ntagger Test <test@example.test> 1 +0000\n\n`),bytes(e)]);
 const binding={bSha,triggerProfile:'owner-initiated-self-v1',tagRef};
 const parsed=parseTag(object(envelope),binding);assert.deepEqual(parsed.amendmentRecordBytes,built.bytes);assert.equal(Object.hasOwn(parsed,'reviewRecordBytes'),false);
 for(const patch of [{reviewRecordBase64:''},{historicalTrigger:'unknown'},{version:3},{amendmentRecordSha256:sha('wrong')}]) assert.throws(()=>parseTag(object({...envelope,...patch}),binding));
 assert.throws(()=>parseTag(object(envelope),{...binding,triggerProfile:'completed-owner-decision-self-v1'}));
});
