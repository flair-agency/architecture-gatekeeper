#!/usr/bin/env node
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

export function validateEnvironment(environment) {
  if (!environment || typeof environment !== 'object') throw new Error('Environment configuration is unavailable.');
  if (environment.can_admins_bypass !== false) throw new Error('Environment must disable administrator bypass.');
  const rule = environment.protection_rules?.find((candidate) => candidate?.type === 'required_reviewers');
  if (!rule) throw new Error('Environment must require reviewer approval.');
  const reviewers = rule.reviewers?.filter((entry) => entry?.reviewer?.login || entry?.reviewer?.slug) || [];
  if (reviewers.length === 0) throw new Error('Environment must name at least one required reviewer.');
  return reviewers.map((entry) => entry.reviewer.login || entry.reviewer.slug);
}

export async function fetchAndValidateEnvironment({ fetchImpl = fetch, apiUrl, repository, environment, token }) {
  const response = await fetchImpl(`${apiUrl}/repos/${repository}/environments/${encodeURIComponent(environment)}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`Environment readback returned HTTP ${response.status}.`);
  const body = await response.json();
  return { body, reviewers: validateEnvironment(body) };
}

async function main() {
  const environment = process.env.OWNER_DECISION_ENVIRONMENT || 'architecture-owner-decision';
  const result = await fetchAndValidateEnvironment({
    apiUrl: process.env.GITHUB_API_URL || 'https://api.github.com',
    repository: process.env.GITHUB_REPOSITORY,
    environment,
    token: process.env.GITHUB_TOKEN,
  });
  console.log(`Architecture Gate owner-decision environment verified with required reviewer(s): ${result.reviewers.join(', ')}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) await main();
