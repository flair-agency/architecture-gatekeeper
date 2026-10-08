import test from 'node:test';
import assert from 'node:assert/strict';
import { readWorkflow } from './helpers/workflow-structure.mjs';

const consumer = readWorkflow('../../.github/workflows/architecture-gate-consumer.yml').workflow;
const self = readWorkflow('../../.github/workflows/architecture-gate.yml').workflow;
const caller = readWorkflow('../../.github/workflows/self-architecture-gate.yml').workflow;

// Coverage map: consumer policy/review/addition permission invariants; self-only
// signer permission and consumer absence invariants; policy->review->addition->
// report->accept dependency paths; protected policy resolution parity; exact
// reviewer action pin and self reusable-workflow source; selected owner-addition
// preparation/review wiring; and provider guard placement in each policy job.
import { assertWorkflowStructure } from './helpers/workflow-structure.mjs';

test('parsed target jobs preserve least privilege, protected policy, and selected route wiring', () => {
  assertWorkflowStructure({ consumer, self, caller });
});
