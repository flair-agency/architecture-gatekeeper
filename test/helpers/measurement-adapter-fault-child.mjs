import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runManualReview, runManualReviewAsync, runHookAsync, runPostToolScreenHook } from '../../dist/local-gate.mjs';
const [root, route] = process.argv.slice(2);
const options = { reviewer: () => ({ decision: 'PASS', authorityFiles: ['AGENTS.md'], reviewedScope: ['fixture'], findings: [] }) };
Object.defineProperty(options, 'measurement', { get() { throw new Error('diagnostic selector unavailable'); } });
// Keep Git's required descriptors intact; simulate an unavailable host warning sink.
Object.defineProperty(process.stderr, 'fd', { value: -1 });
process.stderr.write = () => { throw new Error('warning stream unavailable'); };
if (route === 'manual-sync') assert.equal(runManualReview('task', root, options).decision, 'PASS');
if (route === 'manual-async') assert.equal((await runManualReviewAsync('task', root, options)).decision, 'PASS');
if (route === 'hook') {
  const input = JSON.stringify({hook_event_name:'UserPromptSubmit',session_id:'fault',prompt:'task',cwd:root});
  assert.equal((await runHookAsync(input,root,options)).hookSpecificOutput.hookEventName,'UserPromptSubmit');
}
if (route === 'PostToolUse') {
  writeFileSync(join(root,'candidate.md'),'changed\n');
  const input = {hook_event_name:'PostToolUse',session_id:'fault',tool_name:'Edit',cwd:root};
  options.cwd = root; options.batchDelayMs = 0;
  assert.equal((await runPostToolScreenHook(input,options)).result.status,'PASS');
}
