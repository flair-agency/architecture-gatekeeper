import { appendFileSync } from 'node:fs';

const DECISIONS = new Set<unknown>(['PASS', 'BLOCK', 'OWNER_DECISION']);

/** Routing only; acceptance still comes from the separate report and accept jobs. */
export function ordinaryDecisionKind(raw: unknown): unknown {
  if (typeof raw !== 'string' || !raw || Buffer.byteLength(raw) > 65_536) {
    throw new Error('Ordinary decision is absent or oversized.');
  }
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Ordinary decision is not JSON.'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !DECISIONS.has((value as { decision?: unknown }).decision)) {
    throw new Error('Ordinary decision kind is invalid.');
  }
  // Preserve the original second property read. A getter can return a different
  // value after validation, so the observed return type remains unknown.
  return (value as { decision?: unknown }).decision;
}

/** Internal flat-facade delegation for the existing direct-run behavior. */
export function runCiDecisionKindCli(): void {
  const kind = ordinaryDecisionKind(process.env.DECISION);
  if (!process.env.GITHUB_OUTPUT) throw new Error('GITHUB_OUTPUT is required.');
  appendFileSync(process.env.GITHUB_OUTPUT, `kind=${kind}\n`);
}
