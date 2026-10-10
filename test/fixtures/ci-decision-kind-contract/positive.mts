import { ordinaryDecisionKind } from '../../../src/ci-review/ci-decision-kind.mts';

const observed: unknown = ordinaryDecisionKind('{"decision":"PASS"}');
void observed;
