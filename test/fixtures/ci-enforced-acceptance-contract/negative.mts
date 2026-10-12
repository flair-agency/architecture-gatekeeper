import { assertEnforcedAcceptance } from '../../../src/ci-enforced-acceptance.mjs';
import { assertEnforcedAcceptance as grouped } from '../../../src/ci-review/ci-enforced-acceptance.mjs';

// Review status and conclusion are mandatory on every accepting path.
assertEnforcedAcceptance();
// Review status and conclusion are mandatory on every accepting path.
assertEnforcedAcceptance({});
// A successful review still needs its conclusion.
assertEnforcedAcceptance({ reviewResult: 'success' });
// A conclusion still needs a successful protected review.
assertEnforcedAcceptance({ conclusion: 'PASS' });
// The grouped API retains the same required input contract.
grouped();
// The grouped API retains the same required input contract.
grouped({});

const result = assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS' });
// The returned route is readonly because the runtime freezes it.
result.route = 'owner-addition-pending';
// The route union contains only the two emitted routes.
const unsupported: 'blocked' = result.route;
void unsupported;
