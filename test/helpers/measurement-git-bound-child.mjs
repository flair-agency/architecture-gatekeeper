import assert from 'node:assert/strict';
import {chmodSync,mkdirSync,mkdtempSync,readFileSync,realpathSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {beginMeasurement,loadMeasurementDirectory} from '../../dist/measurement.mjs';
const [stage]=process.argv.slice(2);
const parent=mkdtempSync(join(realpathSync(tmpdir()),'agk-stall-git-'));
const root=join(parent,'repo');const directory=join(parent,'records');const mock=join(parent,'mock-bin');
mkdirSync(join(root,'.codex/gatekeeper'),{recursive:true});mkdirSync(directory,{mode:0o700});mkdirSync(mock);
try {
  writeFileSync(join(root,'.codex/gatekeeper/config.json'),JSON.stringify({validationPath:'.codex/gatekeeper/validation.json',reviewerConfigPath:'.codex/gatekeeper/reviewer.json'}));
  writeFileSync(join(root,'.codex/gatekeeper/validation.json'),'{}');writeFileSync(join(root,'.codex/gatekeeper/reviewer.json'),'{}');
  for (const args of [['init'],['config','user.name','Fixture'],['config','user.email','fixture@example.invalid'],['config','commit.gpgSign','false'],['add','.'],['commit','-m','fixture']]) execFileSync('git',args,{cwd:root,stdio:'ignore'});
  const head=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
  const attempt=beginMeasurement({route:'manual',cwd:root,directory});assert.ok(attempt.id);
  const fake=join(mock,'git');
  writeFileSync(fake,`#!${process.execPath}
const {spawnSync}=require('node:child_process');
const args=process.argv.slice(2);
const stalled=${JSON.stringify(stage)}==='ls-tree'?args.includes('ls-tree'):(args.includes('show')||(args.includes('cat-file')&&args.includes('blob')));
if(${JSON.stringify(stage)}==='slow-sequence'&&(args.includes('cat-file')||args.includes('ls-tree'))){Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,1800);}
if(stalled&&${JSON.stringify(stage)}!=='slow-sequence'){setInterval(()=>{},1000);}else{const r=spawnSync('/usr/bin/git',args,{stdio:'inherit'});process.exit(r.status??1);}
`);chmodSync(fake,0o755);
  const originalPath=process.env.PATH;process.env.PATH=`${mock}:${originalPath}`;
  const started=Date.now();
  try { assert.doesNotThrow(()=>attempt.request({repositoryRoot:root,reviewedRevision:head,requestId:'a'.repeat(64),prompt:'fixture',schema:{}})); }
  finally {process.env.PATH=originalPath;}
  const elapsed=Date.now()-started;assert.ok(elapsed>=9000&&elapsed<18000,`optional Git stall did not return within the existing bound: ${elapsed}`);
  attempt.finish({decision:{decision:'PASS'}});
  const records=loadMeasurementDirectory(directory).records;assert.deepEqual(records.map(r=>r.phase).sort(),['prepared','start','terminal']);
  const terminal=records.find(r=>r.phase==='terminal');assert.equal(terminal.state,'completed');assert.equal(terminal.decision.decision,'PASS');
  assert.deepEqual(terminal.request.selectedInputDigests,{gap:'unavailable'});
} finally {rmSync(parent,{recursive:true,force:true});}
