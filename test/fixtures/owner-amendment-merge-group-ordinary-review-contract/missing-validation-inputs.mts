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

// @ts-expect-error decisionBytes is required by the validator.
validateOwnerAmendmentMergeGroupOrdinaryDecision(withoutDecisionBytes);
// @ts-expect-error the flat facade retains the required decisionBytes input.
validateFlat(withoutDecisionBytes);
// @ts-expect-error expected is required by the validator.
validateOwnerAmendmentMergeGroupOrdinaryDecision(withoutExpected);
// @ts-expect-error the flat facade retains the required expected input.
validateFlat(withoutExpected);
// @ts-expect-error prepared is required by the validator.
validateOwnerAmendmentMergeGroupOrdinaryDecision(withoutPrepared);
// @ts-expect-error the flat facade retains the required prepared input.
validateFlat(withoutPrepared);
// @ts-expect-error the grouped validator requires an input object.
validateOwnerAmendmentMergeGroupOrdinaryDecision();
// @ts-expect-error the flat facade requires an input object.
validateFlat();
// @ts-expect-error an empty input omits all required validator inputs.
validateOwnerAmendmentMergeGroupOrdinaryDecision({});
// @ts-expect-error the flat facade rejects an empty input as well.
validateFlat({});
