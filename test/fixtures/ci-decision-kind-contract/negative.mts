import { ordinaryDecisionKind } from '../../../src/ci-review/ci-decision-kind.mjs';

const assumedTrusted: 'PASS' | 'BLOCK' | 'OWNER_DECISION' = ordinaryDecisionKind('{"decision":"PASS"}');
void assumedTrusted;
