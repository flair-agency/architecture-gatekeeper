import { assertEnforcedAcceptance } from '../../../src/ci-enforced-acceptance.mts';

const ordinary = assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'PASS' });
if (ordinary.route === 'ordinary-pass') {
  const ordinaryRoute: 'ordinary-pass' = ordinary.route;
  void ordinaryRoute;
}
const pending = assertEnforcedAcceptance({ reviewResult: 'success', conclusion: 'OWNER_ADDITION_G0',
  ownerAdditionSelected: 'G0', ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE' });
if (pending.route === 'owner-addition-pending') {
  const pendingRoute: 'owner-addition-pending' = pending.route;
  void pendingRoute;
}
let environmentObservation: unknown;
assertEnforcedAcceptance({ reviewResult: environmentObservation, conclusion: environmentObservation });
