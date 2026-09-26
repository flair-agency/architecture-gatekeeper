#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const DECISIONS = new Set(['PASS', 'BLOCK', 'OWNER_DECISION']);

/** Routing only; acceptance still comes from the separate report and accept jobs. */
export function ordinaryDecisionKind(raw) {
  if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw) > 65_536) {
    throw new Error('Ordinary decision is absent or oversized.');
  }
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('Ordinary decision is not JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !DECISIONS.has(value.decision)) {
    throw new Error('Ordinary decision kind is invalid.');
  }
  return value.decision;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const kind = ordinaryDecisionKind(process.env.DECISION);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\n`);
}
