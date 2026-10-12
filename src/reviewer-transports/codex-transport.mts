import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import type { ReviewRequest, ReviewReviewerSettings } from '../review-contract/review-contract.mts';

type CodexReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra';
type CodexReviewerRequestSettings = Omit<ReviewReviewerSettings, 'provider' | 'reasoningEffort' | 'thinkingBudget' | 'reviewTimeoutMs'> & {
  provider?: 'codex';
  reasoningEffort: CodexReasoningEffort;
  reviewTimeoutMs: number;
  thinkingBudget?: never;
  thinkingLevel?: never;
};
type CodexReviewRequestFor<Request extends ReviewRequest> = Request extends ReviewRequest
  ? Omit<Request, 'reviewer'> & { reviewer: CodexReviewerRequestSettings }
  : never;
export type CodexReviewRequest = CodexReviewRequestFor<ReviewRequest>;

export function runCodexReviewer(request: CodexReviewRequest): unknown {
  const timeout = request?.reviewer?.reviewTimeoutMs;
  if (!Number.isInteger(timeout) || timeout < 1000 || timeout > 3_600_000) {
    throw new Error('Codex reviewer timeout must be an integer between 1000 and 3600000 milliseconds.');
  }
  const dir = mkdtempSync(join(tmpdir(), 'architecture-gate-')); const schemaPath = join(dir, 'decision.schema.json'); const outputPath = join(dir, 'decision.json');
  try { writeFileSync(schemaPath, `${JSON.stringify(request.schema)}\n`, { mode: 0o600 }); const args = ['exec', '--ignore-user-config', '--model', request.reviewer.model, '--config', `model_reasoning_effort=${JSON.stringify(request.reviewer.reasoningEffort)}`, '--disable', 'hooks', '--sandbox', 'read-only', '--config', 'approval_policy="never"', '--ephemeral', '--output-schema', schemaPath, '--output-last-message', outputPath, '--cd', request.repositoryRoot, '-']; const result = spawnSync('codex', args, { cwd: request.repositoryRoot, input: request.prompt, encoding: 'utf8', timeout }); if (result.status !== 0 || !existsSync(outputPath)) throw new Error('Architecture gate reviewer failed or returned invalid output.'); try { return JSON.parse(readFileSync(outputPath, 'utf8')); } catch { throw new Error('Architecture gate reviewer failed or returned invalid output.'); } } finally { rmSync(dir, { recursive: true, force: true }); }
}
