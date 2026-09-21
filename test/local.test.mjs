import test from 'node:test';
import assert from 'node:assert/strict';
import { validate } from '../src/local-gate.mjs';

const cfg = { requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'] };
test('accepts explicit PASS scope', () => assert.equal(validate({ decision: 'PASS', authorityFiles: ['AGENTS.md'], reviewedScope: ['change'] }, cfg).decision, 'PASS'));
