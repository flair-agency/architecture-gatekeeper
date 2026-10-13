import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function createMeasurementAdapterFixture() {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-measurement-adapter-'));
  const root = join(parent, 'repo');
  const records = join(parent, 'records');
  mkdirSync(join(root, '.codex/gatekeeper'), { recursive: true });
  mkdirSync(records, { mode: 0o700 });
  writeFileSync(join(root, 'AGENTS.md'), '# Test authority\n');
  writeFileSync(join(root, 'candidate.md'), 'initial\n');
  writeFileSync(join(root, '.codex/gatekeeper/prompt.md'), 'review\n');
  writeFileSync(join(root, '.codex/gatekeeper/schema.json'), '{"type":"object"}');
  writeFileSync(join(root, '.codex/gatekeeper/reviewer.json'), '{"model":"fixture","reasoningEffort":"low"}');
  writeFileSync(join(root, '.codex/gatekeeper/config.json'), JSON.stringify({ version: 1,
    authorityFiles: ['AGENTS.md'], requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'],
    promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json',
    reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000 }));
  for (const args of [['init'], ['config', 'user.name', 'Test'], ['config', 'user.email', 'test@example.invalid'], ['add', '.'], ['commit', '-m', 'fixture']]) {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
  }
  return { root, records, cleanup: () => rmSync(parent, { recursive: true, force: true }) };
}
