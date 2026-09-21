import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDecisionRules } from '../src/validate-decision.mjs';

const policy = {
  version: 1,
  rules: [{
    when: { path: '/gates/architecture/decision', equals: 'BLOCK' },
    require: { path: '/decision', equals: 'BLOCK' },
    message: 'nested BLOCK requires top-level BLOCK'
  }]
};

test('accepts a consumer-consistent decision', () => {
  const decision = { decision: 'BLOCK', gates: { architecture: { decision: 'BLOCK' } } };
  assert.equal(validateDecisionRules(decision, policy), decision);
});

test('fails closed on a consumer-defined inconsistency', () => {
  assert.throws(
    () => validateDecisionRules({ decision: 'OWNER_DECISION', gates: { architecture: { decision: 'BLOCK' } } }, policy),
    /nested BLOCK requires top-level BLOCK/
  );
});

test('does not infer undeclared nested semantics', () => {
  const decision = { decision: 'OWNER_DECISION', gates: { compatibility: { decision: 'BLOCK' } } };
  assert.equal(validateDecisionRules(decision, policy), decision);
});

test('rejects malformed policies instead of skipping them', () => {
  assert.throws(() => validateDecisionRules({}, { version: 1, rules: [{ when: {} }] }), /invalid rule/);
});
