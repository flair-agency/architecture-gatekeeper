#!/usr/bin/env node
// Queue metadata completeness only. This result is not review evidence or acceptance.
import { validateQueuedPrDescription } from '../dist/pr-description-completeness.mjs';

function argumentsFrom(argv) {
  const values = Object.create(null);
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!['--pr-number', '--base-sha', '--head-sha'].includes(key) || values[key] !== undefined || typeof argv[i + 1] !== 'string') throw new Error('Use --pr-number, --base-sha and --head-sha once each.');
    values[key] = argv[i + 1];
  }
  return {
    prNumber: values['--pr-number'] ?? process.env.SELF_PR_NUMBER,
    baseSha: values['--base-sha'] ?? process.env.SELF_PR_BASE_SHA,
    headSha: values['--head-sha'] ?? process.env.SELF_PR_HEAD_SHA,
    token: process.env.GITHUB_TOKEN,
  };
}

try {
  const result = await validateQueuedPrDescription(argumentsFrom(process.argv.slice(2)));
  if (result.status !== 'VALIDATED' || !result.ok) {
    for (const error of result.errors) console.error(error);
    console.error(result.reason ?? 'PR description completeness validation failed.');
    process.exitCode = 1;
  } else {
    console.log('PR description sections are populated. This does not verify claims, tests, authority, security, or acceptance.');
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'PR description completeness could not be selected.');
  process.exitCode = 1;
}
