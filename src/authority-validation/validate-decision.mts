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
  const item = condition as Record<string, unknown> | null | undefined;
  const equalsType = typeof item?.equals;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition) ||
      !Object.hasOwn(condition, 'equals') ||
      !((item!.equals === null) || ['string', 'boolean'].includes(equalsType) ||
        (equalsType === 'number' && Number.isFinite(item!.equals))) ||
      Object.keys(condition).some(key => !['path', 'equals'].includes(key))) {
    fail('Decision validation rule has an invalid condition.');
  }
  valueAt({}, item!.path);
}

function conditionMatches(document: unknown, condition: unknown): boolean {
  const item = condition as Record<string, unknown>;
  return valueAt(document, item.path) === item.equals;
}

/** Validate existing policy rules and return the same decision object. */
export function validateDecisionRules<TDecision>(decision: TDecision, policy: unknown): TDecision {
  const candidate = policy as Record<string, unknown> | null | undefined;
  if (!candidate || candidate.version !== 1 || !Array.isArray(candidate.rules)) fail('Decision validation policy is unsupported.');
  for (const rawRule of candidate.rules) {
    const rule = rawRule as Record<string, unknown> | null;
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || typeof rule.message !== 'string' || !rule.message.trim() ||
        Object.keys(rule).some(key => !['when', 'require', 'message'].includes(key)) || !rule.when || !rule.require) {
      fail('Decision validation policy contains an invalid rule.');
    }
    validateCondition(rule.when);
    validateCondition(rule.require);
  }
  for (const rawRule of candidate.rules) {
    const rule = rawRule as Record<string, unknown>;
    if (conditionMatches(decision, rule.when) && !conditionMatches(decision, rule.require)) {
      fail(`Decision validation failed: ${rule.message as string}`);
    }
  }
  return decision;
}
