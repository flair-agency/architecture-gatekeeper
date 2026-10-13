import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createMeasurementAdapterFixture} from './helpers/measurement-adapter-fixture.mjs';

for(const capture of [false,true])test(`PostToolUse CLI fails nonzero when both primary and fallback publication hit a real closed pipe; capture=${capture}`,async t=>{
  const f=createMeasurementAdapterFixture();t.after(f.cleanup);
  const module=new URL('../dist/local-gate.mjs',import.meta.url).href;
  const script=`import {runPostToolScreenHookCli} from ${JSON.stringify(module)};runPostToolScreenHookCli();`;
  const args=['--input-type=module','-e',script],env={...process.env,AGK_MEASUREMENT_DIR:capture?f.records:''};
  const healthy=spawnSync(process.execPath,args,{cwd:f.root,env,input:'{bad',encoding:'utf8',timeout:5000});
  assert.equal(healthy.status,0,healthy.stderr);assert.equal(JSON.parse(healthy.stdout).hookSpecificOutput.hookEventName,'PostToolUse');
  const child=spawn(process.execPath,args,{cwd:f.root,env,stdio:['pipe','pipe','pipe']});
  let stderr='';child.stderr.setEncoding('utf8');child.stderr.on('data',bytes=>{stderr+=bytes;});
  const done=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',(code,signal)=>resolve({code,signal}));});
  const timer=setTimeout(()=>child.kill('SIGKILL'),5000);t.after(()=>{clearTimeout(timer);if(child.exitCode===null)child.kill('SIGKILL');});
  child.stdout.destroy();child.stdin.end('{bad');
  const result=await done;assert.equal(result.signal,null,stderr);assert.equal(result.code,2,stderr);
});
