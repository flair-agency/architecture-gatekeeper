#!/usr/bin/env node

import { verifyLegacyValidationSelection, runVerifyLegacyValidationSelection } from './ci-review/verify-legacy-validation-selection.mts';

export { verifyLegacyValidationSelection };

if (process.argv[1]?.endsWith('/verify-legacy-validation-selection.mjs')) {
  runVerifyLegacyValidationSelection(process.argv);
}
