#!/usr/bin/env node

export function verifyLegacyValidationSelection(baseValidationPath, callerValidationPath) {
  if (typeof baseValidationPath !== 'string' || typeof callerValidationPath !== 'string' ||
      baseValidationPath !== callerValidationPath) {
    throw new Error('Caller validation-path must exactly match the recorded-base v1 policy selection; use an empty string only when the base policy explicitly selects null.');
  }
  return { validationPath: baseValidationPath || null };
}

if (process.argv[1]?.endsWith('/verify-legacy-validation-selection.mjs')) {
  const [, , baseValidationPath, callerValidationPath] = process.argv;
  if (baseValidationPath === undefined || callerValidationPath === undefined) {
    throw new Error('Usage: verify-legacy-validation-selection.mjs <base-path-or-empty> <caller-path-or-empty>');
  }
  verifyLegacyValidationSelection(baseValidationPath, callerValidationPath);
}
