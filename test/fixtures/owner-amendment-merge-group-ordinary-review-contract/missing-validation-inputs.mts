import {
  validateOwnerAmendmentMergeGroupOrdinaryDecision,
  type ValidateMergeGroupOrdinaryDecisionInput,
} from '../../../src/owner-amendment/owner-amendment-merge-group-ordinary-review.mts';
import { validateOwnerAmendmentMergeGroupOrdinaryDecision as validateFlat } from '../../../src/owner-amendment-merge-group-ordinary-review.mjs';

const complete: ValidateMergeGroupOrdinaryDecisionInput = {
  decisionBytes: null,
  expected: null,
  prepared: null,
};
const { decisionBytes: _decisionBytes, ...withoutDecisionBytes } = complete;
const { expected: _expected, ...withoutExpected } = complete;
const { prepared: _prepared, ...withoutPrepared } = complete;
void [_decisionBytes, _expected, _prepared];

// decisionBytes is required by the validator.
validateOwnerAmendmentMergeGroupOrdinaryDecision(withoutDecisionBytes);
// the flat facade retains the required decisionBytes input.
validateFlat(withoutDecisionBytes);
// expected is required by the validator.
validateOwnerAmendmentMergeGroupOrdinaryDecision(withoutExpected);
// the flat facade retains the required expected input.
validateFlat(withoutExpected);
// prepared is required by the validator.
validateOwnerAmendmentMergeGroupOrdinaryDecision(withoutPrepared);
// the flat facade retains the required prepared input.
validateFlat(withoutPrepared);
// the grouped validator requires an input object.
validateOwnerAmendmentMergeGroupOrdinaryDecision();
// the flat facade requires an input object.
validateFlat();
// an empty input omits all required validator inputs.
validateOwnerAmendmentMergeGroupOrdinaryDecision({});
// the flat facade rejects an empty input as well.
validateFlat({});
