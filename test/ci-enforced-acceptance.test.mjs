import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { assertEnforcedAcceptance as accept } from '../dist/ci-enforced-acceptance.mjs';
const ordinary = { reviewResult: 'success', conclusion: 'PASS', selfAuthorityCheckRequired: 'true', selectedAuthorityChanged: 'false', ownerAmendmentSelected: 'protected-pr' };
const amendment = { ...ordinary, selectedAuthorityChanged: 'true', conclusion: 'BLOCK', ownerAmendmentResult: 'success', ownerAmendmentVerification: 'success' };
test('ordinary unchanged PASS works without any tag or amendment result; BLOCK and OWNER_DECISION remain refused', () => {
  assert.deepEqual(accept(ordinary), { route: 'ordinary-pass' });
  for (const conclusion of ['BLOCK', 'OWNER_DECISION', undefined, 'ELIGIBLE']) assert.throws(() => accept({ ...ordinary, conclusion }));
  for (const reviewResult of ['skipped','neutral','failure','cancelled',undefined]) assert.throws(() => accept({ ...ordinary, reviewResult }));
});
test('Authority change is accepted only as a separately verified amendment, even if ordinary AI erroneously says PASS', () => {
  for (const conclusion of ['BLOCK','OWNER_DECISION','PASS']) {
    assert.deepEqual(accept({ ...amendment, conclusion }), { route: 'owner-amendment-eligible' });
    for (const key of ['ownerAmendmentResult','ownerAmendmentVerification']) {
      for (const value of ['skipped','neutral','failure','cancelled','',undefined]) assert.throws(() => accept({ ...amendment, conclusion, [key]: value }));
    }
    for (const selected of ['', 'G0', undefined]) assert.throws(() => accept({ ...amendment, conclusion, ownerAmendmentSelected: selected }));
  }
  for (const conclusion of ['ERROR', 'WAIVED', '', undefined]) assert.throws(() => accept({ ...amendment, conclusion }));
  for (const changed of ['',undefined,'unknown']) assert.throws(() => accept({ ...amendment, selectedAuthorityChanged: changed }));
  assert.throws(() => accept({ ...ordinary, ownerAmendmentVerification: 'success' }));
});
test('missing or forged eligibility text is not a verified job outcome', () => {
  assert.throws(() => accept({ ...amendment, ownerAmendmentVerification: 'ELIGIBLE' }));
  const run = spawnSync(process.execPath, [new URL('../dist/ci-enforced-acceptance.mjs', import.meta.url).pathname], {
    env: { ...process.env, REVIEW_RESULT:'success', CONCLUSION:'PASS', SELF_AUTHORITY_CHECK_REQUIRED:'true',
      SELECTED_AUTHORITY_CHANGED:'true', OWNER_AMENDMENT_SELECTED:'protected-pr', OWNER_AMENDMENT_RESULT:'success',
      OWNER_AMENDMENT_VERIFICATION:'skipped' }, encoding:'utf8' });
  assert.notEqual(run.status,0); assert.doesNotMatch(run.stdout,/route:/);
});
test('valid OWNER_ADDITION remains a separate available procedure', () => {
  assert.deepEqual(accept({ ...ordinary, selectedAuthorityChanged:'true', conclusion:'OWNER_ADDITION_G0',
    ownerAdditionSelected:'G0',ownerAdditionResult:'success',ownerAdditionEligibility:'ELIGIBLE' }), { route:'owner-addition-pending' });
  assert.throws(() => accept({ ...ordinary, selectedAuthorityChanged:'true', conclusion:'OWNER_ADDITION_G0',
    ownerAdditionSelected:'G0',ownerAdditionResult:'success',ownerAdditionEligibility:'INELIGIBLE' }));
});
