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

test('supports JSON scalar equality', () => {
  const scalarPolicy = value => ({
    version: 1,
    rules: [{ when: { path: '/value', equals: value }, require: { path: '/accepted', equals: true }, message: 'scalar match' }]
  });
  for (const value of ['BLOCK', 1, false, null]) {
    assert.throws(() => validateDecisionRules({ value, accepted: false }, scalarPolicy(value)), /scalar match/);
  }
});

test('rejects object and array equality as an unsupported policy contract', () => {
  for (const value of [{ decision: 'BLOCK' }, ['BLOCK']]) {
    const structuralPolicy = {
      version: 1,
      rules: [{ when: { path: '/value', equals: value }, require: { path: '/accepted', equals: true }, message: 'structural match' }]
    };
    assert.throws(() => validateDecisionRules({ value, accepted: true }, structuralPolicy), /invalid condition/);
  }
});

test('rejects a malformed requirement even when its condition does not match', () => {
  const malformedRequirementPolicy = {
    version: 1,
    rules: [{
      when: { path: '/decision', equals: 'BLOCK' },
      require: { path: '/gates', equals: { architecture: 'BLOCK' } },
      message: 'unreachable malformed requirement'
    }]
  };
  assert.throws(
    () => validateDecisionRules({ decision: 'PASS' }, malformedRequirementPolicy),
    /invalid condition/
  );
});

test('validates every rule before evaluating any implication', () => {
  const policyWithLaterMalformedRule = {
    version: 1,
    rules: [
      {
        when: { path: '/decision', equals: 'PASS' },
        require: { path: '/accepted', equals: true },
        message: 'first implication fails'
      },
      {
        when: { path: '/decision', equals: 'BLOCK' },
        require: { path: '/gates', equals: ['unsupported'] },
        message: 'later malformed requirement'
      }
    ]
  };
  assert.throws(
    () => validateDecisionRules({ decision: 'PASS', accepted: false }, policyWithLaterMalformedRule),
    /invalid condition/
  );
});
