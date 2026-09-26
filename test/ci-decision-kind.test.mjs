import assert from 'node:assert/strict';
import test from 'node:test';
import { ordinaryDecisionKind } from '../src/ci-decision-kind.mjs';

test('routes only a bounded completed ordinary decision kind', () => {
  for (const kind of ['PASS', 'BLOCK', 'OWNER_DECISION']) {
    assert.equal(ordinaryDecisionKind(JSON.stringify({ decision: kind, summary: 'fixture' })), kind);
  }
  for (const raw of ['', '{', '[]', '{}', '{"decision":"OWNER_ADDITION_G0"}', 'x'.repeat(65_537)]) {
    assert.throws(() => ordinaryDecisionKind(raw));
  }
});
