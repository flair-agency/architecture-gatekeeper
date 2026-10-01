#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REVIEW_ACTION_STEP_TIMEOUT_MINUTES = 5;
export const MIN_REVIEW_JOB_TIMEOUT_MINUTES = REVIEW_ACTION_STEP_TIMEOUT_MINUTES + 1;
const JOB_MAX = 360;
const CODEX_MIN = 60;
const CODEX_MAX = 240;

function parseInteger(value, label) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a positive integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is out of range`);
  return number;
}

export function validateReviewTimeouts(jobTimeoutMinutes, codexTimeoutSeconds) {
  const requestedJob = parseInteger(String(jobTimeoutMinutes), 'Review job timeout');
  const codex = parseInteger(String(codexTimeoutSeconds), 'Codex Action timeout');
  if (requestedJob > JOB_MAX) throw new Error(`Review job timeout must not exceed ${JOB_MAX} minutes`);
  if (codex < CODEX_MIN || codex > CODEX_MAX) throw new Error(`Codex Action timeout must be ${CODEX_MIN}-${CODEX_MAX} seconds`);
  const job = Math.max(requestedJob, MIN_REVIEW_JOB_TIMEOUT_MINUTES);
  return { jobTimeoutMinutes: job, codexTimeoutSeconds: codex };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const validated = validateReviewTimeouts(
      process.env.REVIEW_JOB_TIMEOUT_MINUTES,
      process.env.CODEX_TIMEOUT_SECONDS,
    );
    process.stdout.write(`jobTimeoutMinutes=${validated.jobTimeoutMinutes}\n`);
    process.stdout.write(`codexTimeoutSeconds=${validated.codexTimeoutSeconds}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
