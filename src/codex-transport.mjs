import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
export function runCodexReviewer(request) {
  const dir = mkdtempSync(join(tmpdir(), 'architecture-gate-')); const schemaPath = join(dir, 'decision.schema.json'); const outputPath = join(dir, 'decision.json');
  try { writeFileSync(schemaPath, `${JSON.stringify(request.schema)}\n`, { mode: 0o600 }); const args = ['exec', '--ignore-user-config', '--model', request.reviewer.model, '--config', `model_reasoning_effort=${JSON.stringify(request.reviewer.reasoningEffort)}`, '--disable', 'hooks', '--sandbox', 'read-only', '--config', 'approval_policy="never"', '--ephemeral', '--output-schema', schemaPath, '--output-last-message', outputPath, '--cd', request.repositoryRoot, '-']; const result = spawnSync('codex', args, { cwd: request.repositoryRoot, input: request.prompt, encoding: 'utf8', timeout: request.reviewer.reviewTimeoutMs }); if (result.status !== 0 || !existsSync(outputPath)) throw new Error('Architecture gate reviewer failed or returned invalid output.'); try { return JSON.parse(readFileSync(outputPath, 'utf8')); } catch { throw new Error('Architecture gate reviewer failed or returned invalid output.'); } } finally { rmSync(dir, { recursive: true, force: true }); }
}
