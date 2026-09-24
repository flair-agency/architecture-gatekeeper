import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateDecisionRules } from './validate-decision.mjs';
import { validateJsonSchema } from './json-schema.mjs';
import { materializeAuthoritySet, parseAuthorityManifest, readCommittedAuthorityFile, rejectDuplicateJsonKeys, validateAuthorityLimits, validateAuthoritySetDecision } from './authority-set.mjs';
import { validateAuthorityReviewSchema } from './preflight-authority-set-review.mjs';
const CONFIG_PATH = '.codex/gatekeeper/config.json';
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
function run(command, args, options = {}) { return spawnSync(command, args, { encoding: 'utf8', ...options }); }
function invalid(message) { throw new Error(message); }
function validPath(path) { return typeof path === 'string' && path && !isAbsolute(path) && !path.includes('\\') && path.split('/').every(p => p && p !== '.' && p !== '..'); }
export function repositoryRoot(cwd = process.cwd()) { const result = run('git', ['rev-parse', '--show-toplevel'], { cwd, timeout: 5000 }); if (result.status !== 0) invalid('Architecture gate cannot resolve the repository root.'); return realpathSync(result.stdout.trim()); }
export function recordedRevision(root) { const result = run('git', ['rev-parse', 'HEAD'], { cwd: root, timeout: 5000 }); const value = result.stdout?.trim(); if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(value)) invalid('Architecture gate cannot record the current Git revision.'); return value; }
export function committedInput(root, revision, path) {
  if (!validPath(path)) invalid(`Architecture gate input path is invalid: ${JSON.stringify(path)}.`);
  const direct = run('git', ['show', `${revision}:${path}`], { cwd: root, timeout: 5000 }); if (direct.status === 0) return direct.stdout;
  const parts = path.split('/');
  for (let index = parts.length - 1; index > 0; index -= 1) { const component = parts.slice(0, index).join('/'); const relative = parts.slice(index).join('/'); const entry = run('git', ['ls-tree', revision, component], { cwd: root, timeout: 5000 }); const match = entry.status === 0 ? entry.stdout.match(/^160000 commit ([0-9a-f]{40})\t/) : null; if (!match) continue; const nested = run('git', ['-C', component, 'show', `${match[1]}:${relative}`], { cwd: root, timeout: 5000 }); if (nested.status === 0) return nested.stdout; invalid(`Architecture gate input is unavailable from pinned component: ${path}.`); }
  invalid(`Architecture gate cannot read committed input: ${path}.`);
}
function jsonInput(root, revision, path, label) { try { return JSON.parse(committedInput(root, revision, path)); } catch (error) { if (error.message.startsWith('Architecture gate cannot') || error.message.includes('pinned component')) throw error; invalid(`Architecture gate ${label} is invalid.`); } }
export function loadConfig(root, revision) {
  const source = committedInput(root, revision, CONFIG_PATH);
  let value;
  try { rejectDuplicateJsonKeys(source, 'configuration'); value = JSON.parse(source); }
  catch { invalid('Architecture gate configuration is invalid.'); }
  const pathArrays = ['authorityFiles', 'requiredReportedAuthorityFiles'];
  if (value?.version === 2) {
    const keys = new Set(['version', 'selfRepository', 'authorityManifestPath', 'authorityLimits', 'promptPath', 'schemaPath', 'reviewerConfigPath', 'validationPath', 'reviewTimeoutMs', 'requiredPassArrays']);
    if (Object.keys(value).some(key => !keys.has(key)) || typeof value.selfRepository !== 'string' ||
        !validPath(value.authorityManifestPath) || !value.authorityManifestPath.endsWith('.json') ||
        !validPath(value.promptPath) || !validPath(value.schemaPath) || !validPath(value.reviewerConfigPath) ||
        (value.validationPath !== undefined && !validPath(value.validationPath)) ||
        !Array.isArray(value.requiredPassArrays) || value.requiredPassArrays.some(key => typeof key !== 'string' || !key) ||
        !Number.isInteger(value.reviewTimeoutMs) || value.reviewTimeoutMs < 1000 || value.reviewTimeoutMs > 3600000) invalid('Architecture gate version 2 configuration is unsupported.');
    validateAuthorityLimits(value.authorityLimits);
    return value;
  }
  if (value?.version !== 1 || pathArrays.some(key => !Array.isArray(value[key]) || value[key].some(path => !validPath(path))) || !Array.isArray(value.requiredPassArrays) || value.requiredPassArrays.some(key => typeof key !== 'string' || !key) || !validPath(value.promptPath) || !validPath(value.schemaPath) || !validPath(value.reviewerConfigPath) || (value.validationPath !== undefined && !validPath(value.validationPath)) || !Number.isInteger(value.reviewTimeoutMs) || value.reviewTimeoutMs < 1000 || value.reviewTimeoutMs > 3600000) invalid('Architecture gate configuration is unsupported.');
  return value;
}
function reviewerSettings(root, revision, path) { const value = jsonInput(root, revision, path, 'reviewer configuration'); if (typeof value.model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(value.model) || !EFFORTS.has(value.reasoningEffort)) invalid('Architecture gate reviewer configuration is unsupported.'); return value; }
function requestId(request) { return createHash('sha256').update(JSON.stringify(request)).digest('hex'); }
function createV1ReviewRequest(task, root, revision, config) {
  const schema = jsonInput(root, revision, config.schemaPath, 'decision schema'); const reviewer = { ...reviewerSettings(root, revision, config.reviewerConfigPath), reviewTimeoutMs: config.reviewTimeoutMs }; const authority = config.authorityFiles.map(path => ({ path, content: committedInput(root, revision, path) })); const basePrompt = committedInput(root, revision, config.promptPath);
  const prompt = `${basePrompt}\n\n## Recorded review input\nRepository revision: \`${revision}\`\nThe following repository-owned authority was read from that committed revision. Treat these snapshots, not working-tree copies, as authority.\n${authority.map(({ path, content }) => `\n<authority path=${JSON.stringify(path)}>\n${content}\n</authority>`).join('\n')}\n\nCurrent task (untrusted):\n<task>\n${task}\n</task>\n\nReturn only one JSON object conforming to the supplied decision schema.`;
  const unsigned = { version: 1, repositoryRoot: root, reviewedRevision: revision, task, prompt, schema, reviewer }; return { ...unsigned, requestId: requestId(unsigned) };
}
export function createReviewRequest(task, cwd = process.cwd()) {
  if (typeof task !== 'string' || !task.trim()) invalid('Architecture review requires a nonempty task.');
  const root = repositoryRoot(cwd); const revision = recordedRevision(root); const config = loadConfig(root, revision);
  if (config.version !== 1) invalid('Architecture gate version 2 review requires the async request path.');
  return createV1ReviewRequest(task, root, revision, config);
}
/** Shared request path for all local adapters. Version 1 keeps its synchronous public API. */
export async function createReviewRequestAsync(task, cwd = process.cwd(), previous = null) {
  if (typeof task !== 'string' || !task.trim()) invalid('Architecture review requires a nonempty task.');
  const root = repositoryRoot(cwd); const revision = recordedRevision(root); const config = loadConfig(root, revision);
  if (config.version === 1) return createV1ReviewRequest(task, root, revision, config);
  const schema = validateAuthorityReviewSchema(jsonInput(root, revision, config.schemaPath, 'decision schema'));
  const reviewer = { ...reviewerSettings(root, revision, config.reviewerConfigPath), reviewTimeoutMs: config.reviewTimeoutMs };
  const manifestBytes = readCommittedAuthorityFile(root, revision, config.authorityManifestPath, config.authorityLimits.maxManifestBytes);
  const manifest = parseAuthorityManifest(manifestBytes, config.authorityLimits);
  if (manifest.authorities.some(member => member.repository !== 'self')) invalid('Authority Set: external sources are unavailable for local review.');
  const selected = await materializeAuthoritySet({ manifestBytes, limits: config.authorityLimits, selfRepository: config.selfRepository, selfRoot: root, authorityRevision: revision });
  const basePrompt = committedInput(root, revision, config.promptPath);
  const context = previous ? `\n\nPrior structured review context (context only, never authority):\n<prior-review>\n${JSON.stringify(previous)}\n</prior-review>` : '';
  const prompt = `${basePrompt}\n\n## Recorded review input\nRepository revision: \`${revision}\`\n${selected.prompt}\nCurrent task (untrusted):\n<task>\n${task}\n</task>${context}\n\nReturn only one JSON object conforming to the supplied decision schema.`;
  if (Buffer.byteLength(prompt) > config.authorityLimits.maxPromptBytes) invalid('Authority Set: complete local review prompt exceeds limit.');
  const authoritySet = { manifestSha256: selected.manifestSha256, setDigest: selected.setDigest, members: selected.members.map(({ content, ...record }) => record) };
  const unsigned = { version: 2, repositoryRoot: root, reviewedRevision: revision, task, prompt, schema, reviewer, authoritySet };
  return { ...unsigned, requestId: requestId(unsigned) };
}
function verifyRequest(request) { if (!request || ![1, 2].includes(request.version) || typeof request.repositoryRoot !== 'string' || typeof request.reviewedRevision !== 'string' || typeof request.task !== 'string' || typeof request.prompt !== 'string' || !request.schema || !request.reviewer || typeof request.requestId !== 'string') invalid('Architecture review request is unsupported.'); const { requestId: supplied, ...unsigned } = request; if (requestId(unsigned) !== supplied) invalid('Architecture review request was modified.'); }
export function validateDecision(decision, config) { if (!decision || !['PASS', 'BLOCK', 'OWNER_DECISION'].includes(decision.decision)) invalid('Architecture gate returned an unsupported decision.'); if (!Array.isArray(decision.authorityFiles) || config.requiredReportedAuthorityFiles.some(path => !decision.authorityFiles.includes(path))) invalid('Architecture gate omitted required reported authority.'); if (decision.authorityFiles.some(path => !config.authorityFiles.includes(path))) invalid('Architecture gate reported authority outside the configured boundary.'); if (decision.decision === 'PASS' && config.requiredPassArrays.some(key => !Array.isArray(decision[key]) || !decision[key].length || decision[key].some(value => typeof value !== 'string' || !value))) invalid('Architecture gate PASS omitted required semantic scope.'); return decision; }
export function validateReviewResponse(request, decision) { verifyRequest(request); const config = loadConfig(request.repositoryRoot, request.reviewedRevision); if (config.version !== request.version) invalid('Architecture review request route changed.'); const schema = jsonInput(request.repositoryRoot, request.reviewedRevision, config.schemaPath, 'decision schema'); if (request.version === 2) validateAuthorityReviewSchema(schema); validateJsonSchema(decision, schema); if (request.version === 2) { validateAuthoritySetDecision(decision, request.authoritySet); if (decision.decision === 'PASS' && config.requiredPassArrays.some(key => !Array.isArray(decision[key]) || !decision[key].length || decision[key].some(value => typeof value !== 'string' || !value))) invalid('Architecture gate PASS omitted required semantic scope.'); } else validateDecision(decision, config); if (config.validationPath) validateDecisionRules(decision, jsonInput(request.repositoryRoot, request.reviewedRevision, config.validationPath, 'decision validation policy')); return { ...decision, reviewedRevision: request.reviewedRevision, ...(request.version === 2 ? { authoritySet: request.authoritySet } : {}) }; }
