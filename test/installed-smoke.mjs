#!/usr/bin/env node
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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
process.stdin.resume(); process.stdin.on('end', () => writeFileSync(output, process.env.MOCK_DECISION_JSON || ${JSON.stringify(JSON.stringify(decision))}));
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
  const v2Decision = { decision: 'PASS', summary: 'installed Authority Set passed', authorityIds: ['architecture'], reviewedScope: ['installed package entrypoint'] };
  writeFileSync(join(gate, 'authorities.json'), JSON.stringify({ version: 1, authorities: [{ id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'AGENTS.md' }] }));
  writeFileSync(join(gate, 'schema.json'), JSON.stringify({ type: 'object', additionalProperties: false, required: ['decision', 'summary', 'authorityIds', 'reviewedScope'], properties: { decision: { enum: ['PASS', 'BLOCK', 'OWNER_DECISION'] }, summary: { type: 'string', minLength: 1 }, authorityIds: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } }, reviewedScope: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1 } } } }));
  writeFileSync(join(gate, 'config.json'), JSON.stringify({ version: 2, selfRepository: 'example/consumer', authorityManifestPath: '.codex/gatekeeper/authorities.json', authorityLimits: { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 65536, maxTotalBytes: 262144, maxPromptBytes: 524288 }, requiredPassArrays: ['reviewedScope'], promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json', reviewerConfigPath: '.codex/gatekeeper/reviewer.json', reviewTimeoutMs: 5000 }));
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-m', 'adopt local Authority Set'], { cwd: root });
  env.MOCK_DECISION_JSON = JSON.stringify(v2Decision);
  const v2Manual = JSON.parse(run('architecture-review', ['Review installed Authority Set']));
  if (v2Manual.decision !== 'PASS' || v2Manual.authoritySet?.members[0]?.id !== 'architecture') throw new Error('standalone Authority Set adapter did not pass');
  const v2Hook = JSON.parse(run('architecture-gatekeeper', [], JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'installed-v2-smoke', cwd: root, prompt: 'Review installed Authority Set Hook adapter' })));
  if (!v2Hook.hookSpecificOutput?.additionalContext.includes('"authorityIds"')) throw new Error('Hook Authority Set adapter did not pass');
  const v2RequestPath = join(parent, 'v2-request.json'); const v2DecisionPath = join(parent, 'v2-decision.json');
  const v2Prepared = JSON.parse(run('architecture-review-native', ['prepare', v2RequestPath, 'Review installed Authority Set native adapter']));
  if (!v2Prepared.prompt.includes('Selected Authority Set')) throw new Error('native Authority Set adapter omitted selected sources');
  writeFileSync(v2DecisionPath, JSON.stringify(v2Decision));
  const v2Native = JSON.parse(run('architecture-review-native', ['validate', v2RequestPath, v2DecisionPath]));
  if (v2Native.decision !== 'PASS' || v2Native.authoritySet?.members[0]?.id !== 'architecture') throw new Error('native Authority Set adapter did not pass');
  const policyPath = join(parent, 'policy.json'); writeFileSync(policyPath, JSON.stringify({ version: 1, default: { mode: 'local-only' }, branches: {} }));
  if (!run('architecture-gate-policy', [policyPath, 'main']).includes('mode=local-only')) throw new Error('policy adapter did not pass');
  const multiLimits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 262144, maxTotalBytes: 524288, maxPromptBytes: 1048576 };
  writeFileSync(policyPath, JSON.stringify({ version: 4, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'fixture-model', reasoningEffort: 'low', authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimits: multiLimits, ownerAddition: { version: 2, grade: 'G0', authorityId: 'architecture', authorityPath: 'AGENTS.md',
      promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json' },
  } } }));
  if (!run('architecture-gate-policy', [policyPath, 'main']).includes('authorityProfile=owner-addition-v2')) throw new Error('installed policy v4 route did not resolve');
  writeFileSync(join(root, 'large-authority.md'), 'x'.repeat(153943));
  writeFileSync(join(gate, 'authorities.json'), JSON.stringify({ version: 1, authorities: [
    { id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'AGENTS.md' },
    { id: 'large-authority', repository: 'self', revision: 'authority-revision', path: 'large-authority.md' },
  ] }));
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-m', 'CI multi-document smoke'], { cwd: root });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const installedSrc = dirname(realpathSync(join(installedBin, 'architecture-review-native')));
  const multiOutput = join(parent, 'multi-authority');
  execFileSync(process.execPath, [join(installedSrc, 'prepare-authority-set.mjs'), '--manifest', join(gate, 'authorities.json'),
    '--self-repository', 'example/consumer', '--self-root', root, '--authority-sha', base,
    '--limits-base64', Buffer.from(JSON.stringify(multiLimits)).toString('base64'), '--profile', 'owner-addition-v2',
    '--affected-id', 'architecture', '--affected-path', 'AGENTS.md', '--output-dir', multiOutput], { cwd: root });
  const multiProvenance = JSON.parse(readFileSync(join(multiOutput, 'authority-provenance.json'), 'utf8'));
  if (multiProvenance.version !== 2 || multiProvenance.members.length !== 2) throw new Error('installed multi-document materialization omitted authority');
  execFileSync(process.execPath, [join(installedSrc, 'validate-authority-set-decision.mjs'), join(multiOutput, 'authority-provenance.json')],
    { cwd: root, input: JSON.stringify({ decision: 'PASS', authorityIds: ['architecture', 'large-authority'], authoritySetDigest: multiProvenance.setDigest }) });
} finally {
  rmSync(parent, { recursive: true, force: true });
}
