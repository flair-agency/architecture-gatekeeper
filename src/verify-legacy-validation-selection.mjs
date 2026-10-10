#!/usr/bin/env node

import { verifyLegacyValidationSelection } from './ci-review/verify-legacy-validation-selection.mts';

export { verifyLegacyValidationSelection };

if (process.argv[1]?.endsWith('/verify-legacy-validation-selection.mjs')) {
  const [, , baseValidationPath, callerValidationPath] = process.argv;
  if (baseValidationPath === undefined || callerValidationPath === undefined) {
    throw new Error('Usage: verify-legacy-validation-selection.mjs <base-path-or-empty> <caller-path-or-empty>');
  }
  verifyLegacyValidationSelection(baseValidationPath, callerValidationPath);
}
