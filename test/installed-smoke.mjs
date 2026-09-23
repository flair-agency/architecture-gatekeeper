#!/usr/bin/env node
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const suppliedBin = process.argv[2];
if (!suppliedBin) throw new Error('Usage: installed-smoke.mjs <installed-bin-directory>');
const installedBin = isAbsolute(suppliedBin) ? suppliedBin : resolve(suppliedBin);
const parent = mkdtempSync(join(tmpdir(), 'architecture-gate-installed-'));
try {
  const root = join(parent, 'consumer'); const gate = join(root, '.codex', 'gatekeeper'); const mockBin = join(parent, 'mock-bin');
  mkdirSync(gate, { recursive: true }); mkdirSync(mockBin);
  writeFileSync(join(root, 'AGENTS.md'), '# Installed smoke authority\n');
  writeFileSync(join(gate, 'prompt.md'), 'Review the supplied authority.\n');
  writeFileSync(join(gate, 'schema.json'), JSON.stringify({ type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityFiles', 'reviewedScope'], properties: { decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string', minLength: 1 }, authorityFiles: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }, reviewedScope: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } } }));
  writeFileSync(join(gate, 'reviewer.json'), JSON.stringify({ model: 'fixture-model', reasoningEffort: 'low' }));
  writeFileSync(join(gate, 'config.json'), JSON.stringify({ version: 1, authorityFiles: ['AGENTS.md'], requiredReportedAuthorityFiles: ['AGENTS.md'], requiredPassArrays: ['reviewedScope'], promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000 }));
  const decision = { decision: 'PASS', summary: 'installed adapter passed', authorityFiles: ['AGENTS.md'], reviewedScope: ['installed package entrypoint'] };
  const codex = join(mockBin, 'codex');
  writeFileSync(codex, `#!/usr/bin/env node
const { writeFileSync } = require('node:fs');
const args = process.argv.slice(2); const output = args[args.indexOf('--output-last-message') + 1];
process.stdin.resume(); process.stdin.on('end', () => writeFileSync(output, ${JSON.stringify(JSON.stringify(decision))}));
`); chmodSync(codex, 0o755);
  execFileSync('git', ['init'], { cwd: root }); execFileSync('git', ['config', 'user.name', 'Smoke'], { cwd: root }); execFileSync('git', ['config', 'user.email', 'smoke@example.invalid'], { cwd: root }); execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-m', 'fixture'], { cwd: root });
  const env = { ...process.env, PATH: `${mockBin}:${process.env.PATH}` };
  const run = (name, args = [], input) => { const result = spawnSync(join(installedBin, name), args, { cwd: root, env, input, encoding: 'utf8' }); if (result.status !== 0) throw new Error(`${name} failed: ${result.stderr}`); return result.stdout; };
  const manual = JSON.parse(run('architecture-review', ['Review installed standalone adapter']));
  if (manual.decision !== 'PASS') throw new Error('standalone adapter did not pass');
  const hook = JSON.parse(run('architecture-gatekeeper', [], JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'installed-smoke', cwd: root, prompt: 'Review installed Hook adapter' })));
  if (!hook.hookSpecificOutput?.additionalContext.includes('"decision": "PASS"')) throw new Error('Hook adapter did not pass');
  const requestPath = join(parent, 'request.json'); const decisionPath = join(parent, 'decision.json');
  const prepared = JSON.parse(run('architecture-review-native', ['prepare', requestPath, 'Review installed native adapter']));
  if (prepared.reviewTimeoutMs !== 5000) throw new Error('native adapter omitted reviewTimeoutMs');
  writeFileSync(decisionPath, JSON.stringify(decision));
  const native = JSON.parse(run('architecture-review-native', ['validate', requestPath, decisionPath]));
  if (native.decision !== 'PASS') throw new Error('native adapter did not pass');
  const policyPath = join(parent, 'policy.json'); writeFileSync(policyPath, JSON.stringify({ version: 1, default: { mode: 'local-only' }, branches: {} }));
  if (!run('architecture-gate-policy', [policyPath, 'main']).includes('mode=local-only')) throw new Error('policy adapter did not pass');
  const manifestPath = join(parent, 'authority-set.json'); writeFileSync(manifestPath, JSON.stringify({ version: 1, authorities: [{ id: 'installed-authority', repository: 'self', revision: 'authority-revision', path: 'AGENTS.md' }] }));
  const limitsPath = join(parent, 'authority-limits.json'); writeFileSync(limitsPath, JSON.stringify({ maxManifestBytes: 4096, maxMembers: 2, maxFileBytes: 4096, maxTotalBytes: 4096, maxPromptBytes: 8192 }));
  const bundlePath = join(parent, 'authority-bundle');
  run('architecture-prepare-authority-set', ['--manifest', manifestPath, '--self-repository', 'flair-agency/smoke', '--self-root', root, '--authority-sha', execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), '--limits', limitsPath, '--output-dir', bundlePath]);
  const provenance = JSON.parse(readFileSync(join(bundlePath, 'authority-provenance.json'), 'utf8'));
  if (provenance.members[0].id !== 'installed-authority') throw new Error('Authority Set preparation adapter did not pass');
} finally {
  rmSync(parent, { recursive: true, force: true });
}
