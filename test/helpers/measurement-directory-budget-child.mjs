import assert from 'node:assert/strict';
import {mkdirSync,mkdtempSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {beginMeasurement,loadMeasurementDirectory,measurementDigest,resumeNativeMeasurement} from '../../dist/measurement.mjs';
const malformed=process.argv[2]==='malformed';
const parent=mkdtempSync(join(realpathSync(tmpdir()),'agk-directory-budget-'));
try {
 const root=join(parent,'repo'),directory=join(parent,'records');mkdirSync(root);mkdirSync(directory,{mode:0o700});
 const path=join(parent,'request.json'),request={repositoryRoot:root,requestId:'a'.repeat(64),reviewedRevision:'b'.repeat(40),prompt:'fixture',schema:{}};
 const attempt=beginMeasurement({route:'native',cwd:root,directory,correlation:measurementDigest(resolve(path))});assert.ok(attempt.id);attempt.request(request);
 assert.equal(resumeNativeMeasurement(path,request,directory).id,attempt.id);
 const original=loadMeasurementDirectory(directory).records.find(r=>r.phase==='start');
 for(let i=0;i<40;i++) {
   const attemptId=String(i).padStart(8,'0')+'-abcd-abcd-abcd-123456789abc';
   writeFileSync(join(directory,attemptId+'.start.json'),malformed?'x'.repeat(240000):JSON.stringify({...original,attemptId,context:{padding:'x'.repeat(240000)}}),{mode:0o600});
   if(i===15){const below=loadMeasurementDirectory(directory);assert.equal(below.records.length,malformed?2:18);assert.equal(below.gaps,malformed?16:0);assert.equal(resumeNativeMeasurement(path,request,directory).id,attempt.id);}
 }
 assert.throws(()=>loadMeasurementDirectory(directory),/directory read byte limit/);
 assert.equal(resumeNativeMeasurement(path,request,directory).id,null);
 const requiredResult={decision:'PASS'};assert.doesNotThrow(()=>attempt.finish({decision:requiredResult}));assert.equal(requiredResult.decision,'PASS');
}finally{rmSync(parent,{recursive:true,force:true});}
