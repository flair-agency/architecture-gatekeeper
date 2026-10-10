function fail(message: string): never { throw new Error(message); }

function valueAt(document: unknown, path: unknown): unknown {
  if (typeof path !== 'string' || !path.startsWith('/') || /~(?![01])/u.test(path)) {
    fail('Decision validation rule has an invalid path.');
  }
  return path.slice(1).split('/').reduce<unknown>((value, part) => {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    return value && typeof value === 'object' && Object.hasOwn(value, key)
      ? (value as Record<string, unknown>)[key] : undefined;
  }, document);
}

function validateCondition(condition: unknown): void {
  const equalsType = typeof (condition as Record<string, unknown> | null | undefined)?.equals;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition) ||
      !Object.hasOwn(condition, 'equals') ||
      !(((condition as Record<string, unknown>).equals === null) || ['string', 'boolean'].includes(equalsType) ||
        (equalsType === 'number' && Number.isFinite((condition as Record<string, unknown>).equals))) ||
      Object.keys(condition).some(key => !['path', 'equals'].includes(key))) {
    fail('Decision validation rule has an invalid condition.');
  }
  valueAt({}, (condition as Record<string, unknown>).path);
}

function conditionMatches(document: unknown, condition: unknown): boolean {
  return valueAt(document, (condition as Record<string, unknown>).path) === (condition as Record<string, unknown>).equals;
}

/** Validate existing policy rules and return the same decision object. */
export function validateDecisionRules<TDecision>(decision: TDecision, policy: unknown): TDecision {
  if (!(policy as Record<string, unknown> | null | undefined) || (policy as Record<string, unknown>).version !== 1 || !Array.isArray((policy as Record<string, unknown>).rules)) fail('Decision validation policy is unsupported.');
  for (const rule of (policy as { rules: unknown[] }).rules) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || typeof (rule as Record<string, unknown>).message !== 'string' || !((rule as Record<string, unknown>).message as string).trim() ||
        Object.keys(rule).some(key => !['when', 'require', 'message'].includes(key)) || !(rule as Record<string, unknown>).when || !(rule as Record<string, unknown>).require) {
      fail('Decision validation policy contains an invalid rule.');
    }
    validateCondition((rule as Record<string, unknown>).when);
    validateCondition((rule as Record<string, unknown>).require);
  }
  for (const rule of (policy as { rules: unknown[] }).rules) {
    if (conditionMatches(decision, (rule as Record<string, unknown>).when) && !conditionMatches(decision, (rule as Record<string, unknown>).require)) {
      fail(`Decision validation failed: ${(rule as Record<string, unknown>).message as string}`);
    }
  }
  return decision;
}
