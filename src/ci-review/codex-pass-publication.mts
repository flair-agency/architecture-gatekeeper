import { randomBytes } from 'node:crypto';
import { rejectDuplicateJsonKeys } from '../authority-set.mts';

export const CODEX_REVIEW_FRAME = 'AGK_CODEX_REVIEW_DISPLAY_V1 ';
export const CODEX_REVIEW_STEP = 'Publish validated ordinary Codex review display';
export const MAX_CODEX_DISPLAY_BYTES = 262_144;
// Existing hosted Codex logs approach 1 MiB; this separate 4 MiB transport ceiling
// changes neither the 64 KiB decision limit nor prompt/authority bounds.
export const MAX_CODEX_LOG_BYTES = 4 * 1_048_576;
export type RecordValue = Record<string, unknown>;
export type ReviewContext = {
  repository: string; runId: string; runAttempt: string; eventSha: string;
  callerWorkflowSha: string; callerWorkflowRef: string; workflowRepository: string;
  workflowSha: string; workflowRef: string; baseSha: string; headSha: string; reviewedSha: string;
};
export type ReviewConclusion = 'PASS' | 'BLOCK' | 'OWNER_DECISION';
export type ReviewExpected = ReviewContext & { nonce: string; conclusion: ReviewConclusion; decisionDigest: string };
const CONCLUSIONS = new Set<unknown>(['PASS', 'BLOCK', 'OWNER_DECISION']);
export function fail(): never { throw new Error('Protected Codex review display failed its fixed boundary checks.'); }
export function record(value: unknown): value is RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}
const CONTEXT_KEYS = ['repository','runId','runAttempt','eventSha','callerWorkflowSha','callerWorkflowRef',
  'workflowRepository','workflowSha','workflowRef','baseSha','headSha','reviewedSha'];
/** Exact expected caller selection, never a network destination. */
export function workflowReference(value: string, repository: string): { path: string; ref: string } {
  if (typeof value !== 'string' || value.length > 512 || !value.startsWith(`${repository}/.github/workflows/`)) fail();
  const reference = value.slice(repository.length + 1); const at = reference.indexOf('@');
  if (at < 1) fail();
  const path = reference.slice(0,at); const ref = reference.slice(at + 1);
  if (!/^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(path) ||
      !(/^[a-f0-9]{40}$/.test(ref) || /^refs\/(heads|tags)\/[A-Za-z0-9._/-]+$/.test(ref))) fail();
  return { path, ref };
}
export function requireSelfReviewContext(context: ReviewContext): void {
  contextOf(context);
  if (context.callerWorkflowRef !== `${context.repository}/.github/workflows/self-architecture-gate.yml@refs/heads/main` ||
      ![`${context.repository}/.github/workflows/architecture-gate.yml@${context.workflowSha}`,
        `${context.repository}/.github/workflows/architecture-gate.yml@refs/heads/main`].includes(context.workflowRef)) fail();
}
export function contextOf(value: unknown): ReviewContext {
  if (!record(value) || Object.keys(value).sort().join() !== [...CONTEXT_KEYS].sort().join()) fail();
  const captured = Object.fromEntries(CONTEXT_KEYS.map(key => [key,value[key]]));
  for (const key of CONTEXT_KEYS) if (typeof captured[key] !== 'string') fail();
  const c = captured as ReviewContext;
  if (c.repository !== 'flair-agency/architecture-gatekeeper' || c.workflowRepository !== c.repository ||
      !/^[1-9][0-9]{0,15}$/.test(c.runId) || !/^[1-9][0-9]{0,5}$/.test(c.runAttempt) ||
      ![c.eventSha,c.callerWorkflowSha,c.workflowSha,c.baseSha,c.headSha,c.reviewedSha].every(s => /^[a-f0-9]{40}$/.test(s)) ||
      new Set([c.baseSha,c.headSha,c.reviewedSha]).size !== 3 ||
      !workflowReference(c.callerWorkflowRef,c.repository) || !workflowReference(c.workflowRef,c.workflowRepository)) fail();
  return c;
}
export function expectedOf(value: unknown): ReviewExpected {
  if (!record(value) || Object.keys(value).sort().join() !== [...CONTEXT_KEYS,'nonce','conclusion','decisionDigest'].sort().join()) fail();
  const { nonce, conclusion, decisionDigest, ...context } = value;
  const checked = contextOf(context);
  if (typeof nonce !== 'string' || !/^[a-f0-9]{48}$/.test(nonce) || !CONCLUSIONS.has(conclusion) ||
      typeof decisionDigest !== 'string' || !/^[a-f0-9]{64}$/.test(decisionDigest)) fail();
  return { ...checked, nonce, conclusion: conclusion as ReviewConclusion, decisionDigest };
}
const DISPLAY_KEYS = ['decision','findings','summary','authority','authorityFiles','authorityIds','responsibility',
  'capabilitySurface','qualityGuarantees','reviewedScope','prohibitedChanges','gates'];
/** The caller has validated ORIGINAL bytes; this structure has display authority only. */
export function createReviewDisplay(context: ReviewContext, decision: unknown, digest: string) {
  const checked = contextOf(context);
  if (!record(decision) || !CONCLUSIONS.has(decision.decision) || !/^[a-f0-9]{64}$/.test(digest)) fail();
  const display: RecordValue = {};
  for (const key of DISPLAY_KEYS) if (Object.hasOwn(decision,key)) display[key] = decision[key];
  const expected: ReviewExpected = { ...checked, nonce: randomBytes(24).toString('hex'), conclusion: decision.decision as ReviewConclusion, decisionDigest: digest };
  const projection = { version: 1, kind: 'display-only', expected, decision: display };
  if (Buffer.byteLength(JSON.stringify(projection)) > MAX_CODEX_DISPLAY_BYTES) fail();
  return { expected, projection };
}
export function emitReviewDisplay(projection: unknown, write: (text: string) => void = text => process.stdout.write(text)): void {
  if (!record(projection) || projection.version !== 1 || projection.kind !== 'display-only') fail();
  expectedOf(projection.expected);
  const json = JSON.stringify(projection);
  if (!json || /[\r\n]/.test(json) || Buffer.byteLength(json) > MAX_CODEX_DISPLAY_BYTES) fail();
  const stop = `agk_codex_${randomBytes(32).toString('hex')}`;
  write(`::stop-commands::${stop}\n`);
  try { write(`${CODEX_REVIEW_FRAME}${json}\n`); } finally { write(`::${stop}::\n`); }
}
export function parseReviewLog(log: string, expected: ReviewExpected): RecordValue {
  expectedOf(expected);
  if (Buffer.byteLength(log) > MAX_CODEX_LOG_BYTES) fail();
  const lines = log.split(/\r?\n/).map(line => line.replace(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /,''));
  const frames = lines.filter(line => line.startsWith(CODEX_REVIEW_FRAME));
  if (frames.length !== 1 || Buffer.byteLength(frames[0]) > MAX_CODEX_DISPLAY_BYTES + CODEX_REVIEW_FRAME.length) fail();
  let p: unknown; try {
    const json = frames[0].slice(CODEX_REVIEW_FRAME.length);
    rejectDuplicateJsonKeys(json,'Codex display',{maxDepth:256}); p = JSON.parse(json);
  } catch { fail(); }
  if (!record(p) || Object.keys(p).sort().join() !== 'decision,expected,kind,version' || p.version !== 1 || p.kind !== 'display-only') fail();
  const observed = expectedOf(p.expected);
  for (const key of Object.keys(expected) as (keyof ReviewExpected)[]) if (observed[key] !== expected[key]) fail();
  if (!record(p.decision) || p.decision.decision !== expected.conclusion || Object.keys(p.decision).some(k => !DISPLAY_KEYS.includes(k))) fail();
  return p.decision;
}
