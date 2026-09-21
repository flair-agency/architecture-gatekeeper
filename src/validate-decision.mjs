#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function fail(message) { throw new Error(message); }

function valueAt(document, path) {
  if (typeof path !== 'string' || !path.startsWith('/')) fail('Decision validation rule has an invalid path.');
  return path.slice(1).split('/').reduce((value, part) => {
    const key = part.replaceAll('~1', '/').replaceAll('~0', '~');
    return value && typeof value === 'object' && Object.hasOwn(value, key) ? value[key] : undefined;
  }, document);
}

function validateCondition(condition) {
  const equalsType = typeof condition?.equals;
  if (!condition || typeof condition !== 'object' || Array.isArray(condition) ||
      !Object.hasOwn(condition, 'equals') ||
      !((condition.equals === null) || ['string', 'boolean'].includes(equalsType) ||
        (equalsType === 'number' && Number.isFinite(condition.equals))) ||
      Object.keys(condition).some(key => !['path', 'equals'].includes(key))) {
    fail('Decision validation rule has an invalid condition.');
  }
  valueAt({}, condition.path);
}

function conditionMatches(document, condition) {
  return valueAt(document, condition.path) === condition.equals;
}

export function validateDecisionRules(decision, policy) {
  if (!policy || policy.version !== 1 || !Array.isArray(policy.rules)) fail('Decision validation policy is unsupported.');
  for (const rule of policy.rules) {
    if (!rule || typeof rule !== 'object' || Array.isArray(rule) || typeof rule.message !== 'string' || !rule.message.trim() ||
        Object.keys(rule).some(key => !['when', 'require', 'message'].includes(key)) || !rule.when || !rule.require) {
      fail('Decision validation policy contains an invalid rule.');
    }
    validateCondition(rule.when);
    validateCondition(rule.require);
  }
  for (const rule of policy.rules) {
    if (conditionMatches(decision, rule.when) && !conditionMatches(decision, rule.require)) {
      fail(`Decision validation failed: ${rule.message}`);
    }
  }
  return decision;
}

function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1) fail('Usage: validate-decision <policy.json>');
  const policy = JSON.parse(readFileSync(argv[0], 'utf8'));
  validateDecisionRules(JSON.parse(readFileSync(0, 'utf8')), policy);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 2; }
}
