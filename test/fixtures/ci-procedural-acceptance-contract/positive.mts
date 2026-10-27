import { assertProceduralV5Acceptance, type ProceduralV5AcceptanceInput, type ProceduralV5AcceptanceRoute } from '../../../src/ci-review/ci-procedural-acceptance.mts';
import { assertProceduralV5Acceptance as flat } from '../../../src/ci-procedural-acceptance.mts';

const ordinary: ProceduralV5AcceptanceInput = {
  policyVersion: '5', evidenceProducer: 'github-actions', reviewResult: 'success',
  conclusion: 'PASS', selectedAuthorityChanged: 'false',
};
const ordinaryResult = assertProceduralV5Acceptance(ordinary);
const ordinaryRoute: ProceduralV5AcceptanceRoute = ordinaryResult;
const flatRoute: ProceduralV5AcceptanceRoute = flat({
  policyVersion: '5', evidenceProducer: 'github-actions', reviewResult: 'success',
  conclusion: 'OWNER_ADDITION_G0_PENDING', selectedAuthorityChanged: 'true',
  ownerAdditionSelected: 'G0', ownerAdditionResult: 'success', ownerAdditionEligibility: 'ELIGIBLE',
});
void ordinaryRoute;
void flatRoute;
