#!/usr/bin/env node
import { chmodSync, copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
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
  const consumerCwd = realpathSync(root);
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
  // Exercise the installed Gemini path using model-free HTTP, with a poison
  // Codex executable so a hidden child-provider fallback fails this smoke.
  writeFileSync(join(gate, 'reviewer.json'), JSON.stringify({ provider: 'gemini', model: 'gemini-2.5-flash', thinkingBudget: 0 }));
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-m', 'select installed Gemini'], { cwd: root });
  const preload = join(parent, 'gemini-fetch.mjs');
  const responseFixture = join(parent, 'gemini-response.json');
  writeFileSync(responseFixture, JSON.stringify({ modelVersion: 'fixture-backend', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(decision) }] } }] }));
  writeFileSync(preload, "import { readFileSync } from 'node:fs';\nglobalThis.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(process.env.AGK_SMOKE_RESPONSE_FILE, 'utf8')) });\n");
  env.AGK_SMOKE_RESPONSE_FILE = responseFixture;
  const originalCodex = readFileSync(codex, 'utf8');
  writeFileSync(codex, '#!/usr/bin/env node\nprocess.stderr.write("Codex must not start for Gemini"); process.exit(99);\n');
  env.NODE_OPTIONS = `--import=${JSON.stringify(preload)}`;
  env.GEMINI_API_KEY = 'fixture-key';
  delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY;
  delete env.CLOUDSDK_AUTH_ACCESS_TOKEN; delete env.GOOGLE_OAUTH_ACCESS_TOKEN; delete env.REVIEW_PROXY_URL;
  const geminiManual = JSON.parse(run('architecture-review', ['--execution-report', 'Review installed Gemini adapter']));
  if (geminiManual.execution?.provider !== 'gemini' || geminiManual.execution?.backendReportedModel !== 'fixture-backend') throw new Error('installed Gemini execution identity missing');
  if (geminiManual.decision.decision !== 'PASS') throw new Error('installed Gemini decision not validated');
  const geminiHook = JSON.parse(run('architecture-gatekeeper', [], JSON.stringify({ hook_event_name: 'UserPromptSubmit', session_id: 'installed-gemini', cwd: root, prompt: 'Review installed Gemini Hook' })));
  if (!geminiHook.hookSpecificOutput?.additionalContext.includes('"decision": "PASS"')) throw new Error('installed Hook did not select Gemini');
  delete env.NODE_OPTIONS; delete env.GEMINI_API_KEY; delete env.AGK_SMOKE_RESPONSE_FILE;
  writeFileSync(codex, originalCodex);
  writeFileSync(join(gate, 'reviewer.json'), JSON.stringify({ model: 'fixture-model', reasoningEffort: 'low' }));
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
  const installedSrc = dirname(realpathSync(join(installedBin, 'architecture-review-native')));
  writeFileSync(join(root, 'AGENTS.md'), '# Installed smoke authority\n\nTracked candidate change.\n');
  const postToolModule = `import { runPostToolScreenHookCli } from '@flair-agency/architecture-gatekeeper';\nprocess.chdir(${JSON.stringify(consumerCwd)});\nrunPostToolScreenHookCli();`;
  const postTool = spawnSync(process.execPath, ['--input-type=module', '-e', postToolModule], {
    env, input: JSON.stringify({ hook_event_name: 'PostToolUse', session_id: 'installed-post-tool-smoke', cwd: consumerCwd, tool_name: 'Edit', tool_use_id: 'installed-use', turn_id: 'installed-turn' }),
    encoding: 'utf8', timeout: 30000,
  });
  if (postTool.status !== 0) throw new Error(`installed PostToolUse module entry failed: ${postTool.stderr}`);
  const postToolOutput = JSON.parse(postTool.stdout);
  if (postToolOutput.hookSpecificOutput?.hookEventName !== 'PostToolUse' || !postToolOutput.hookSpecificOutput.additionalContext.includes('"status":"PASS"') || !postToolOutput.hookSpecificOutput.additionalContext.includes('snapshotSha256')) {
    throw new Error('installed PostToolUse module entry did not return informational PASS context');
  }
  if ('decision' in postToolOutput.hookSpecificOutput || postToolOutput.continue === false) throw new Error('PostToolUse screen exposed a blocking Hook decision');
  const policyPath = join(parent, 'policy.json'); writeFileSync(policyPath, JSON.stringify({ version: 1, default: { mode: 'local-only' }, branches: {} }));
  if (!run('architecture-gate-policy', [policyPath, 'main']).includes('mode=local-only')) throw new Error('policy adapter did not pass');
  const multiLimits = { maxManifestBytes: 16384, maxMembers: 16, maxFileBytes: 262144, maxTotalBytes: 524288, maxPromptBytes: 1048576 };
  writeFileSync(policyPath, JSON.stringify({ version: 4, default: { mode: 'local-only' }, branches: { main: {
    mode: 'enforced', model: 'fixture-model', reasoningEffort: 'low', authorityManifestPath: '.codex/gatekeeper/authorities.json',
    authorityLimits: multiLimits, ownerAddition: { version: 2, grade: 'G0', authorityId: 'architecture', authorityPath: 'AGENTS.md',
      promptPath: '.codex/gatekeeper/prompt.md', schemaPath: '.codex/gatekeeper/schema.json' },
  } } }));
  if (!run('architecture-gate-policy', [policyPath, 'main']).includes('authorityProfile=owner-addition-v2')) throw new Error('installed policy v4 route did not resolve');
  const proceduralPolicy = JSON.parse(readFileSync(policyPath, 'utf8'));
  proceduralPolicy.version = 5;
  proceduralPolicy.branches.main.mode = 'procedural';
  proceduralPolicy.branches.main.adoptionEvidence = { producer: 'github-actions',
    workflowPath: '.github/workflows/architecture-gate.yml', jobName: 'Architecture Gate / owner-addition' };
  writeFileSync(policyPath, JSON.stringify(proceduralPolicy));
  const procedural = run('architecture-gate-policy', [policyPath, 'main']);
  if (!procedural.includes('mode=procedural') || !procedural.includes('adoptionEvidenceProducer=github-actions')) {
    throw new Error('installed policy v5 route did not resolve');
  }
  const finalizer = spawnSync(join(installedBin, 'architecture-owner-addition-finalize'), [],
    { cwd: root, env, encoding: 'utf8' });
  if (finalizer.status === 0 || !finalizer.stderr.includes('usage: owner-addition-finalize')) {
    throw new Error('installed finalizer entrypoint is unavailable');
  }
  const geminiScript = resolve(installedBin, 'architecture-review-gemini-ci');
  const geminiCi = spawnSync(process.execPath, [geminiScript],
    { cwd: root, env, encoding: 'utf8' });
  if (geminiCi.status === 0 || !geminiCi.stderr.includes('gemini-ci-runner')) {
    throw new Error('installed gemini-ci entrypoint is unavailable');
  }
  writeFileSync(join(root, 'large-authority.md'), 'x'.repeat(153943));
  writeFileSync(join(gate, 'authorities.json'), JSON.stringify({ version: 1, authorities: [
    { id: 'architecture', repository: 'self', revision: 'authority-revision', path: 'AGENTS.md' },
    { id: 'large-authority', repository: 'self', revision: 'authority-revision', path: 'large-authority.md' },
  ] }));
  execFileSync('git', ['add', '.'], { cwd: root }); execFileSync('git', ['commit', '-m', 'CI multi-document smoke'], { cwd: root });
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const multiOutput = join(parent, 'multi-authority');
  execFileSync(process.execPath, [join(installedSrc, 'prepare-authority-set.mjs'), '--manifest', join(gate, 'authorities.json'),
    '--self-repository', 'example/consumer', '--self-root', root, '--authority-sha', base,
    '--limits-base64', Buffer.from(JSON.stringify(multiLimits)).toString('base64'), '--profile', 'owner-addition-v2',
    '--affected-id', 'architecture', '--affected-path', 'AGENTS.md', '--output-dir', multiOutput], { cwd: root });
  const multiProvenance = JSON.parse(readFileSync(join(multiOutput, 'authority-provenance.json'), 'utf8'));
  if (multiProvenance.version !== 2 || multiProvenance.members.length !== 2) throw new Error('installed multi-document materialization omitted authority');
  execFileSync(process.execPath, [join(installedSrc, 'validate-authority-set-decision.mjs'), join(multiOutput, 'authority-provenance.json')],
    { cwd: root, input: JSON.stringify({ decision: 'PASS', authorityIds: ['architecture', 'large-authority'], authoritySetDigest: multiProvenance.setDigest }) });
  // Run the existing ordinary semantic fixture against the installed public
  // subpath, with Node resolving the package from this isolated consumer.
  const packageNodeModules = join(process.cwd(), 'node_modules');
  if (realpathSync(installedBin) !== realpathSync(join(packageNodeModules, '.bin'))) {
    throw new Error('installed smoke must run from the installation prefix');
  }
  const apiTests = join(root, 'api-tests');
  mkdirSync(apiTests);
  symlinkSync(packageNodeModules, join(root, 'node_modules'), 'dir');
  copyFileSync(new URL('./preview-lifecycle.test.mjs', import.meta.url), join(apiTests, 'preview-lifecycle.test.mjs'));
  copyFileSync(new URL('./preview-amendment-block.test.mjs', import.meta.url), join(apiTests, 'preview-amendment-block.test.mjs'));
  copyFileSync(new URL('./preview-addition.test.mjs', import.meta.url), join(apiTests, 'preview-addition.test.mjs'));
  copyFileSync(new URL('./preview-amendment-owner.test.mjs', import.meta.url), join(apiTests, 'preview-amendment-owner.test.mjs'));
  copyFileSync(new URL('./preview-migration-initial.test.mjs', import.meta.url), join(apiTests, 'preview-migration-initial.test.mjs'));
  const apiTestGroups = [
    { name: 'ordinary and B API fixtures', files: ['preview-lifecycle.test.mjs', 'preview-amendment-block.test.mjs',
      'preview-addition.test.mjs', 'preview-amendment-owner.test.mjs'] },
    { name: 'migration API fixture', files: ['preview-migration-initial.test.mjs'] },
  ];
  for (const group of apiTestGroups) {
    try {
      execFileSync(process.execPath, ['--test', ...group.files.map(file => join(apiTests, file))], {
        cwd: root, timeout: 120000, stdio: 'pipe', maxBuffer: 1_048_576,
      });
    } catch (error) {
      const output = value => {
        const text = Buffer.isBuffer(value) ? value.toString('utf8') : String(value ?? '');
        const limit = 64 * 1024;
        return text.length <= limit ? text : `${text.slice(0, limit)}\n[output truncated at ${limit} characters]`;
      };
      throw new Error(`Installed API test group "${group.name}" failed (${error.code ?? error.status ?? 'unknown'}).\n` +
        `Child stdout:\n${output(error.stdout)}\nChild stderr:\n${output(error.stderr)}`, { cause: error });
    }
  }
} finally {
  rmSync(parent, { recursive: true, force: true });
}
