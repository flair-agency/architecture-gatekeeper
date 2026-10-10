import { verifyLegacyValidationSelection } from '../../../src/ci-review/verify-legacy-validation-selection.mts';

const result = verifyLegacyValidationSelection('', '');
const unavailablePath: undefined = result.validationPath;
void unavailablePath;
