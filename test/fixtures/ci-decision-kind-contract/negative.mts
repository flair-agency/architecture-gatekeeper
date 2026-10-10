import { ordinaryDecisionKind } from '../../../src/ci-review/ci-decision-kind.mts';

const assumedTrusted: 'PASS' | 'BLOCK' | 'OWNER_DECISION' = ordinaryDecisionKind('{"decision":"PASS"}');
void assumedTrusted;
