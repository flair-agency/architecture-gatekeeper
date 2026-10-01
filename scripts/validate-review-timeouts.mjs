#!/usr/bin/env node
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const JOB_MAX = 360;
const STEP_MAX = 359;

function parseInteger(value, label) {
  if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) {
    throw new Error(`${label} must be a positive integer`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error(`${label} is out of range`);
  return number;
}

export function validateReviewTimeouts(jobTimeoutMinutes, stepTimeoutMinutes) {
  const requestedJob = parseInteger(String(jobTimeoutMinutes), 'Review job timeout');
  const step = parseInteger(String(stepTimeoutMinutes), 'Review step timeout');
  if (requestedJob > JOB_MAX) throw new Error(`Review job timeout must not exceed ${JOB_MAX} minutes`);
  if (step > STEP_MAX) throw new Error(`Review step timeout must not exceed ${STEP_MAX} minutes`);
  const job = Math.max(requestedJob, step + 1);
  return { jobTimeoutMinutes: job, stepTimeoutMinutes: step };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const validated = validateReviewTimeouts(
      process.env.REVIEW_JOB_TIMEOUT_MINUTES,
      process.env.REVIEW_STEP_TIMEOUT_MINUTES,
    );
    process.stdout.write(`jobTimeoutMinutes=${validated.jobTimeoutMinutes}\n`);
    process.stdout.write(`stepTimeoutMinutes=${validated.stepTimeoutMinutes}\n`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
