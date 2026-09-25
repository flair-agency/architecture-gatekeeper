import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { buildRealPrBlockRecord, validatePrContext } from '../scripts/issue83-real-pr-block-probe.mjs';

const base = 'a'.repeat(40);
const head = 'b'.repeat(40);
const merge = 'c'.repeat(40);
const repository = 'flair-agency/architecture-gatekeeper';
const event = { action: 'synchronize', repository: { full_name: repository }, pull_request: {
  number: 123, draft: false, base: { ref: 'main', sha: base }, head: { sha: head },
} };
const input = { event, repository, workflowSha: base, mergeSha: merge,
  parents: [base, head], runId: '42', runAttempt: '2' };

test('real PR context binds protected base, head and exact merge parents', () => {
  assert.deepEqual(validatePrContext(input), { repository, prNumber: 123, baseSha: base,
    headSha: head, mergeSha: merge, workflowSha: base, runId: '42', runAttempt: '2' });
  for (const changed of [
    { workflowSha: head }, { parents: [head, base] }, { parents: [base] },
    { event: { ...event, pull_request: { ...event.pull_request, draft: true } } },
    { event: { ...event, repository: { full_name: 'other/repo' } } },
  ]) assert.throws(() => validatePrContext({ ...input, ...changed }));
});

test('real PR producer records only a validated complete BLOCK', () => {
  const schema = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/ci-decision.schema.json', import.meta.url)));
  const validation = JSON.parse(readFileSync(new URL('../.codex/gatekeeper/decision.validation.json', import.meta.url)));
  const decision = {
    decision: 'BLOCK', summary: 'Weakens fail-closed behavior', authority: ['protected architecture'],
    authorityFiles: ['docs/architecture.md'], authorityIds: ['architecture-contract'],
    responsibility: ['acceptance'], capabilitySurface: ['CI'], qualityGuarantees: ['fail closed'],
    reviewedScope: ['fixture'], prohibitedChanges: ['accept timeout'],
    gates: {
      sharedMechanism: { decision: 'BLOCK', summary: 'timeout accepted', consumerOwnership: '',
        failClosedBehavior: '', compatibility: '', minimality: '' },
      trustBoundary: { decision: 'PASS', summary: 'credentials isolated', tokenPermissions: '',
        untrustedInputs: '', credentialHandling: '', reportingIsolation: '' },
    },
  };
  const context = validatePrContext(input);
  const provenance = { version: 1, selfRepository: repository, authorityRevision: base,
    members: [{ id: 'architecture-contract' }] };
  const inputDigests = Object.fromEntries(['policy', 'prompt', 'schema', 'validation', 'manifest']
    .map(key => [key, 'd'.repeat(64)]));
  const args = { decision, schema, validation, provenance, context, inputDigests };
  assert.equal(buildRealPrBlockRecord(args).kind, 'test-only-real-pr-block-not-acceptance-evidence');
  assert.throws(() => buildRealPrBlockRecord({ ...args, decision: { ...decision, decision: 'PASS' } }), /BLOCK/);
  assert.throws(() => buildRealPrBlockRecord({ ...args, decision: { ...decision, authorityIds: [] } }));
  assert.throws(() => buildRealPrBlockRecord({ ...args, provenance: { ...provenance, authorityRevision: head } }));
  assert.throws(() => buildRealPrBlockRecord({ ...args, inputDigests: {} }));
});
