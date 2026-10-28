import assert from 'node:assert/strict';
import { runManualReview, runManualReviewAsync, runHookAsync } from '../../dist/local-gate.mjs';
import { createMeasurementAdapterFixture } from './measurement-adapter-fixture.mjs';
const [route] = process.argv.slice(2);
const { root, cleanup } = createMeasurementAdapterFixture();
try {
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

} finally { cleanup(); }
