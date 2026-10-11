import { assertEnforcedAcceptance } from '../../../src/ci-enforced-acceptance.mjs';
import { assertEnforcedAcceptance as grouped } from '../../../src/ci-review/ci-enforced-acceptance.mjs';

// @ts-expect-error Review status and conclusion are mandatory on every accepting path.
assertEnforcedAcceptance();
// @ts-expect-error Review status and conclusion are mandatory on every accepting path.
assertEnforcedAcceptance({});
// @ts-expect-error A successful review still needs its conclusion.
assertEnforcedAcceptance({ reviewResult: 'success' });
// @ts-expect-error A conclusion still needs a successful protected review.
assertEnforcedAcceptance({ conclusion: 'PASS' });
// @ts-expect-error The grouped API retains the same required input contract.
grouped();
// @ts-expect-error The grouped API retains the same required input contract.
grouped({});

const result = assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS' });
// @ts-expect-error The returned route is readonly because the runtime freezes it.
result.route = 'owner-addition-pending';
// @ts-expect-error The route union contains only the two emitted routes.
const unsupported: 'blocked' = result.route;
void unsupported;
