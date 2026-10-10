import { ordinaryDecisionKind } from '../../../src/ci-review/ci-decision-kind.mjs';

const observed: unknown = ordinaryDecisionKind('{"decision":"PASS"}');
void observed;
