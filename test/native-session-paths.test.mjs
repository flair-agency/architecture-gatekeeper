import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {createMeasurementAdapterFixture} from './helpers/measurement-adapter-fixture.mjs';

test('original session accessors never classify prepare task text as a decision path',()=>{
  const module=new URL('../dist/native-session-paths.mjs',import.meta.url).href;
  for(const [command,expected] of [['prepare',['request.json',null]],['validate',['request.json','decision-or-task']],['other',[null,null]]]) {
    const script=`import {trustedNativeRequestPath, trustedNativeDecisionPath} from ${JSON.stringify(module)};process.argv=['node','native-cli',${JSON.stringify(command)},'request.json','decision-or-task'];console.log(JSON.stringify([trustedNativeRequestPath(),trustedNativeDecisionPath()]));`;
    const result=spawnSync(process.execPath,['--input-type=module','-e',script],{encoding:'utf8',timeout:5000});
    assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),expected);
  }
});

test('explicit native API arguments retain their own paths independently of original CLI arguments',t=>{
  const f=createMeasurementAdapterFixture();t.after(f.cleanup);
  const module=new URL('../dist/native-review.mjs',import.meta.url).href;
  const selected=join(f.root,'..','injected-request.json'),original=join(f.root,'..','original-request.json');
  const script=`import {runNativeReviewCli} from ${JSON.stringify(module)};process.argv=['node','native-cli','prepare',${JSON.stringify(original)},'original task'];await runNativeReviewCli(['prepare',${JSON.stringify(selected)},'injected task']);`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:f.root,encoding:'utf8',timeout:5000});
  assert.equal(result.status,0,result.stderr);assert.equal(JSON.parse(result.stdout).requestPath,selected);
  assert.equal(existsSync(original),false);assert.equal(existsSync(selected),true);
  if(process.platform!=='win32')assert.equal(statSync(selected).mode&0o777,0o600);
});
