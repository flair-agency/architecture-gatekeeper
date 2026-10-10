import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { spawnSync } from 'node:child_process';
import { validateDecisionRules } from '../validate-decision.mjs';
import { validateJsonSchema } from '../json-schema.mjs';
import { materializeAuthoritySet, parseAuthorityManifest, readCommittedAuthorityFile, rejectDuplicateJsonKeys, validateAuthorityLimits, validateAuthoritySetDecision } from '../authority-set.mjs';
import { validateAuthorityReviewSchema } from '../preflight-authority-set-review.mjs';
import { validateThinkingBudget } from '../gemini-transport.mjs';

type ParsedJsonRecord = Record<string, unknown>;
type SpawnOptionsView = { cwd?: string; timeout?: number };
type ReviewerOperationView = { provider: unknown };
type ReviewRequestView = { version: unknown; repositoryRoot: unknown; reviewedRevision: unknown; task: unknown; prompt: unknown; schema: unknown; reviewer: unknown; requestId: unknown; authoritySet: unknown };
type DecisionView = Record<string, unknown>;
type MaterializedLocalAuthoritySet = { prompt: string; manifestSha256: string; setDigest: string; members: Array<Record<string, unknown>> };
// These property views preserve external values and rereads as unknown. The
// erased casts below describe existing operations; they do not validate data.
export interface AuthorityLimits {
  maxManifestBytes: number;
  maxMembers: number;
  maxFileBytes: number;
  maxTotalBytes: number;
  maxPromptBytes: number;
}
export interface ReviewConfigV1 {
  version: 1;
  authorityFiles: string[];
  requiredReportedAuthorityFiles: string[];
  requiredPassArrays: string[];
  promptPath: string;
  schemaPath: string;
  reviewerConfigPath: string;
  validationPath?: string;
  reviewTimeoutMs: number;
}
export interface ReviewConfigV2 {
  version: 2;
  selfRepository: string;
  authorityManifestPath: string;
  authorityLimits: AuthorityLimits;
  requiredPassArrays: string[];
  promptPath: string;
  schemaPath: string;
  reviewerConfigPath: string;
  validationPath?: string;
  reviewTimeoutMs: number;
}
export type ReviewConfig = ReviewConfigV1 | ReviewConfigV2;
export interface ReviewReviewerSettings {
  provider?: 'codex' | 'gemini';
  model: string;
  reasoningEffort?: string;
  thinkingBudget?: unknown;
  reviewTimeoutMs?: number;
}
export interface ReviewRequestV1 {
  version: 1; repositoryRoot: string; reviewedRevision: string; task: string;
  prompt: string; schema: unknown; reviewer: ReviewReviewerSettings; requestId: string;
}
export interface ReviewRequestV2 extends Omit<ReviewRequestV1, 'version'> {
  version: 2; authoritySet: unknown;
}
export type ReviewRequest = ReviewRequestV1 | ReviewRequestV2;
export interface ValidatedReviewDecision {
  [key: string]: unknown;
  reviewedRevision: unknown; authoritySet?: unknown;
}
const CONFIG_PATH = '.codex/gatekeeper/config.json';
const EFFORTS = new Set(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
function run(command: string, args: string[], options: SpawnOptionsView = {}) {
  return spawnSync(command, args, { encoding: 'utf8', ...options });
}
function invalid(message: string): never {
  throw new Error(message);
}
function validPath(path: unknown): path is string {
  return (typeof path === 'string' && path && !isAbsolute(path) && !path.includes('\\') &&
    path.split('/').every(p => p && p !== '.' && p !== '..')) as boolean;
}
export function repositoryRoot(cwd: string = process.cwd()): string {
  const result = run('git', ['rev-parse', '--show-toplevel'], { cwd, timeout: 5000 });
  if (result.status !== 0) invalid('Architecture gate cannot resolve the repository root.');
  return realpathSync(result.stdout.trim());
}
export function recordedRevision(root: string): string {
  const result = run('git', ['rev-parse', 'HEAD'], { cwd: root, timeout: 5000 });
  const value = result.stdout?.trim();
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(value)) invalid('Architecture gate cannot record the current Git revision.');
  return value;
}
export function committedInput(root: string, revision: string, path: unknown): string {
  if (!validPath(path)) invalid(`Architecture gate input path is invalid: ${JSON.stringify(path)}.`);
  const direct = run('git', ['show', `${revision}:${path}`], { cwd: root, timeout: 5000 });
  if (direct.status === 0) return direct.stdout;
  const parts = path.split('/');
  for (let index = parts.length - 1; index > 0; index -= 1) {
    const component = parts.slice(0, index).join('/');
    const relative = parts.slice(index).join('/');
    const entry = run('git', ['ls-tree', revision, component], { cwd: root, timeout: 5000 });
    const match = entry.status === 0 ? entry.stdout.match(/^160000 commit ([0-9a-f]{40})\t/) : null;
    if (!match) continue;
    const nested = run('git', ['-C', component, 'show', `${match[1]}:${relative}`], { cwd: root, timeout: 5000 });
    if (nested.status === 0) return nested.stdout;
    invalid(`Architecture gate input is unavailable from pinned component: ${path}.`);
  }
  invalid(`Architecture gate cannot read committed input: ${path}.`);
}
function jsonInput(root: string, revision: string, path: unknown, label: string): unknown {
  try {
    return JSON.parse(committedInput(root, revision, path));
  } catch (error) {
    if ((error as Error).message.startsWith('Architecture gate cannot') || (error as Error).message.includes('pinned component')) throw error;
    invalid(`Architecture gate ${label} is invalid.`);
  }
}
export function loadConfig(root: string, revision: string): ReviewConfig {
  const source = committedInput(root, revision, CONFIG_PATH);
  let value;
  try {
    rejectDuplicateJsonKeys(source, 'configuration');
    value = JSON.parse(source) as ParsedJsonRecord;
  } catch {
    invalid('Architecture gate configuration is invalid.');
  }
  const pathArrays = ['authorityFiles', 'requiredReportedAuthorityFiles'];
  if (value?.version === 2) {
    const keys = new Set(['version', 'selfRepository', 'authorityManifestPath', 'authorityLimits', 'promptPath', 'schemaPath', 'reviewerConfigPath', 'validationPath', 'reviewTimeoutMs', 'requiredPassArrays']);
    if (
      Object.keys(value).some(key => !keys.has(key)) ||
      typeof value.selfRepository !== 'string' ||
      !validPath(value.authorityManifestPath) ||
      !value.authorityManifestPath.endsWith('.json') ||
      !validPath(value.promptPath) ||
      !validPath(value.schemaPath) ||
      !validPath(value.reviewerConfigPath) ||
      (value.validationPath !== undefined && !validPath(value.validationPath)) ||
      !Array.isArray(value.requiredPassArrays) ||
      value.requiredPassArrays.some(key => typeof key !== 'string' || !key) ||
      !Number.isInteger(value.reviewTimeoutMs) ||
      (value.reviewTimeoutMs as number) < 1000 ||
      (value.reviewTimeoutMs as number) > 3600000
    ) invalid('Architecture gate version 2 configuration is unsupported.');
    validateAuthorityLimits(value.authorityLimits);
    // Parsed JSON is a data snapshot; these checks establish this config shape.
    return value as unknown as ReviewConfigV2;
  }
  if (
    value?.version !== 1 ||
    pathArrays.some(key => !Array.isArray(value[key]) || value[key].some(path => !validPath(path))) ||
    !Array.isArray(value.requiredPassArrays) || value.requiredPassArrays.some(key => typeof key !== 'string' || !key) ||
    !validPath(value.promptPath) ||
    !validPath(value.schemaPath) ||
    !validPath(value.reviewerConfigPath) ||
    (value.validationPath !== undefined && !validPath(value.validationPath)) ||
    !Number.isInteger(value.reviewTimeoutMs) ||
    (value.reviewTimeoutMs as number) < 1000 ||
    (value.reviewTimeoutMs as number) > 3600000
  ) invalid('Architecture gate configuration is unsupported.');
  // Parsed JSON is a data snapshot; these checks establish this config shape.
  return value as unknown as ReviewConfigV1;
}
function reviewerSettings(root: string, revision: string, path: string): ReviewReviewerSettings {
  const source = committedInput(root, revision, path);
  let value;
  try {
    value = JSON.parse(source) as ParsedJsonRecord;
    rejectDuplicateJsonKeys(source, 'reviewer configuration');
  } catch (error) {
    if ((error as Error).message.startsWith('Architecture gate cannot') || (error as Error).message.includes('pinned component')) throw error;
    invalid('Architecture gate reviewer configuration is invalid.');
  }
  const provider = Object.hasOwn(value, 'provider') ? value.provider : 'codex';
  if (
    typeof value.model !== 'string' ||
    !/^[A-Za-z0-9._-]+$/.test(value.model) ||
    !['codex', 'gemini'].includes(provider as string)
  ) invalid('Architecture gate reviewer configuration is unsupported.');
  if (provider === 'codex') {
    if (
      !EFFORTS.has(value.reasoningEffort as string) ||
      value.thinkingBudget !== undefined ||
      Object.keys(value).some(key => !['provider', 'model', 'reasoningEffort'].includes(key))
    ) invalid('Architecture gate Codex reviewer configuration is unsupported.');
    // This value is freshly parsed JSON and the provider-specific checks above
    // establish the allowed reviewer fields.
    return value as unknown as ReviewReviewerSettings;
  }
  if (
    value.reasoningEffort !== undefined ||
    Object.keys(value).some(key => !['provider', 'model', 'thinkingBudget'].includes(key))
  ) invalid('Architecture gate Gemini reviewer configuration is unsupported.');
  try {
    validateThinkingBudget(value.model as string, value.thinkingBudget);
  } catch {
    invalid('Architecture gate Gemini reviewer configuration is unsupported.');
  }
  // This value is freshly parsed JSON and the provider-specific checks above
  // establish the allowed reviewer fields.
  return value as unknown as ReviewReviewerSettings;
}
function requestId(request: unknown): string { return createHash('sha256').update(JSON.stringify(request)).digest('hex'); }
function createV1ReviewRequest(task: string, root: string, revision: string, config: ReviewConfigV1): ReviewRequestV1 {
  const schema = jsonInput(root, revision, config.schemaPath, 'decision schema');
  const reviewer = {
    ...reviewerSettings(root, revision, config.reviewerConfigPath),
    reviewTimeoutMs: config.reviewTimeoutMs,
  };
  const authority = config.authorityFiles.map(path => ({ path, content: committedInput(root, revision, path) }));
  const basePrompt = committedInput(root, revision, config.promptPath);
  const prompt = `${basePrompt}\n\n## Recorded review input\nRepository revision: \`${revision}\`\nThe following repository-owned authority was read from that committed revision. Treat these snapshots, not working-tree copies, as authority.\n${authority.map(({ path, content }) => `\n<authority path=${JSON.stringify(path)}>\n${content}\n</authority>`).join('\n')}\n\nCurrent task (untrusted):\n<task>\n${task}\n</task>\n\nReturn only one JSON object conforming to the supplied decision schema.`;
  const unsigned = { version: 1 as const, repositoryRoot: root, reviewedRevision: revision, task, prompt, schema, reviewer };
  return { ...unsigned, requestId: requestId(unsigned) };
}
export function createReviewRequest(task: unknown, cwd: string = process.cwd()): ReviewRequestV1 {
  if (typeof task !== 'string' || !task.trim()) invalid('Architecture review requires a nonempty task.');
  const root = repositoryRoot(cwd);
  const revision = recordedRevision(root);
  const config = loadConfig(root, revision);
  if (config.version !== 1) invalid('Architecture gate version 2 review requires the async request path.');
  return createV1ReviewRequest(task, root, revision, config);
}
/** Shared request path for all local adapters. Version 1 keeps its synchronous public API. */
export async function createReviewRequestAsync(task: unknown, cwd: string = process.cwd(), previous: unknown = null): Promise<ReviewRequest> {
  if (typeof task !== 'string' || !task.trim()) invalid('Architecture review requires a nonempty task.');
  const root = repositoryRoot(cwd);
  const revision = recordedRevision(root);
  const config = loadConfig(root, revision);
  if (config.version === 1) return createV1ReviewRequest(task, root, revision, config);
  const schema = validateAuthorityReviewSchema(jsonInput(root, revision, config.schemaPath, 'decision schema'));
  const reviewer = {
    ...reviewerSettings(root, revision, config.reviewerConfigPath),
    reviewTimeoutMs: config.reviewTimeoutMs,
  };
  const manifestBytes = readCommittedAuthorityFile(root, revision, config.authorityManifestPath, config.authorityLimits.maxManifestBytes);
  const manifest = parseAuthorityManifest(manifestBytes, config.authorityLimits);
  if (manifest.authorities.some((member: unknown) => (member as { repository: unknown }).repository !== 'self')) invalid('Authority Set: external sources are unavailable for local review.');
  // The existing local call intentionally omits the optional external fetcher;
  // this operation view keeps that same call shape despite the JS JSDoc type.
  const selected = await (materializeAuthoritySet as unknown as (input: { manifestBytes: Buffer | undefined; limits: AuthorityLimits; selfRepository: string; selfRoot: string; authorityRevision: string }) => Promise<MaterializedLocalAuthoritySet>)({ manifestBytes, limits: config.authorityLimits, selfRepository: config.selfRepository, selfRoot: root, authorityRevision: revision });
  const basePrompt = committedInput(root, revision, config.promptPath);
  const context = previous ? `\n\nPrior structured review context (context only, never authority):\n<prior-review>\n${JSON.stringify(previous)}\n</prior-review>` : '';
  const prompt = `${basePrompt}\n\n## Recorded review input\nRepository revision: \`${revision}\`\n${selected.prompt}\nCurrent task (untrusted):\n<task>\n${task}\n</task>${context}\n\nReturn only one JSON object conforming to the supplied decision schema.`;
  if (Buffer.byteLength(prompt) > config.authorityLimits.maxPromptBytes) invalid('Authority Set: complete local review prompt exceeds limit.');
  const authoritySet = { manifestSha256: selected.manifestSha256, setDigest: selected.setDigest, members: selected.members.map(({ content, ...record }) => record) };
  const unsigned = { version: 2 as const, repositoryRoot: root, reviewedRevision: revision, task, prompt, schema, reviewer, authoritySet };
  return { ...unsigned, requestId: requestId(unsigned) };
}
function verifyRequest(request: unknown): void {
  if (
    !request ||
    ![1, 2].includes((request as ReviewRequestView).version as number) ||
    typeof (request as ReviewRequestView).repositoryRoot !== 'string' ||
    typeof (request as ReviewRequestView).reviewedRevision !== 'string' ||
    typeof (request as ReviewRequestView).task !== 'string' ||
    typeof (request as ReviewRequestView).prompt !== 'string' ||
    !(request as ReviewRequestView).schema ||
    !(request as ReviewRequestView).reviewer ||
    typeof (request as ReviewRequestView).requestId !== 'string'
  ) invalid('Architecture review request is unsupported.');
  const { requestId: supplied, ...unsigned } = request as ReviewRequestView;
  if (requestId(unsigned) !== supplied) invalid('Architecture review request was modified.');
}
export function validateDecision(decision: unknown, config: ReviewConfigV1): unknown {
  if (!decision || !['PASS', 'BLOCK', 'OWNER_DECISION'].includes((decision as DecisionView).decision as string)) invalid('Architecture gate returned an unsupported decision.');
  if (
    !Array.isArray((decision as DecisionView).authorityFiles) ||
    config.requiredReportedAuthorityFiles.some(path => !((decision as DecisionView).authorityFiles as unknown[]).includes(path))
  ) invalid('Architecture gate omitted required reported authority.');
  if (((decision as DecisionView).authorityFiles as unknown[]).some((path: unknown) => !config.authorityFiles.includes(path as string))) invalid('Architecture gate reported authority outside the configured boundary.');
  if (
    (decision as DecisionView).decision === 'PASS' &&
    config.requiredPassArrays.some(key => !Array.isArray((decision as DecisionView)[key]) || !((decision as DecisionView)[key] as unknown[]).length || ((decision as DecisionView)[key] as unknown[]).some((value: unknown) => typeof value !== 'string' || !value))
  ) invalid('Architecture gate PASS omitted required semantic scope.');
  return decision;
}
export function validateReviewResponse(request: unknown, decision: unknown): ValidatedReviewDecision {
  verifyRequest(request);
  const config = loadConfig((request as ReviewRequestView).repositoryRoot as string, (request as ReviewRequestView).reviewedRevision as string);
  if (config.version !== (request as ReviewRequestView).version) invalid('Architecture review request route changed.');
  const schema = jsonInput((request as ReviewRequestView).repositoryRoot as string, (request as ReviewRequestView).reviewedRevision as string, config.schemaPath, 'decision schema');
  if ((request as ReviewRequestView).version === 2) validateAuthorityReviewSchema(schema);
  validateJsonSchema(decision, schema);
  if ((request as ReviewRequestView).version === 2) {
    validateAuthoritySetDecision(decision, (request as ReviewRequestView).authoritySet);
    if (
      (decision as DecisionView).decision === 'PASS' &&
      config.requiredPassArrays.some(key => !Array.isArray((decision as DecisionView)[key]) || !((decision as DecisionView)[key] as unknown[]).length || ((decision as DecisionView)[key] as unknown[]).some((value: unknown) => typeof value !== 'string' || !value))
    ) invalid('Architecture gate PASS omitted required semantic scope.');
  } else validateDecision(decision, config as ReviewConfigV1);
  if (config.validationPath) validateDecisionRules(decision, jsonInput((request as ReviewRequestView).repositoryRoot as string, (request as ReviewRequestView).reviewedRevision as string, config.validationPath, 'decision validation policy'));
  return {
    ...(decision as DecisionView),
    reviewedRevision: (request as ReviewRequestView).reviewedRevision,
    ...((request as ReviewRequestView).version === 2 ? { authoritySet: (request as ReviewRequestView).authoritySet } : {}),
  };
}

/** Shared preflight for revision-bound execution; response validation remains separate. */
export async function preflightReviewRequest(request: unknown, expectedProvider?: string): Promise<unknown> {
  verifyRequest(request);
  const provider = Object.hasOwn((request as ReviewRequestView).reviewer as object, 'provider') ? ((request as ReviewRequestView).reviewer as ReviewerOperationView).provider : 'codex';
  if (expectedProvider && provider !== expectedProvider) {
    invalid(`Revision-bound ${expectedProvider} execution requires a recorded ${expectedProvider} provider selection.`);
  }
  const canonical = await createReviewRequestAsync((request as ReviewRequestView).task, (request as ReviewRequestView).repositoryRoot as string);
  if (canonical.reviewedRevision !== (request as ReviewRequestView).reviewedRevision) invalid('Architecture review request revision mismatch.');
  if (canonical.requestId !== (request as ReviewRequestView).requestId) invalid('Architecture review request differs from committed inputs.');
  return request;
}
