/** Compare the caller's legacy validation selection with the recorded-base value. */
export function verifyLegacyValidationSelection(baseValidationPath: unknown, callerValidationPath: unknown): { validationPath: string | null } {
  if (typeof baseValidationPath !== 'string' || typeof callerValidationPath !== 'string' ||
      baseValidationPath !== callerValidationPath) {
    throw new Error('Caller validation-path must exactly match the recorded-base v1 policy selection; use an empty string only when the base policy explicitly selects null.');
  }
  return { validationPath: baseValidationPath || null };
}

/** Internal CLI runner for the flat compatibility entrypoint. */
export function runVerifyLegacyValidationSelection(argv: readonly string[]): void {
  const [, , baseValidationPath, callerValidationPath] = argv;
  if (baseValidationPath === undefined || callerValidationPath === undefined) {
    throw new Error('Usage: verify-legacy-validation-selection.mjs <base-path-or-empty> <caller-path-or-empty>');
  }
  verifyLegacyValidationSelection(baseValidationPath, callerValidationPath);
}
