#!/usr/bin/env node
import { MULTI_AUTHORITY_PROFILE, rejectDuplicateJsonKeys, validateAuthorityLimits } from '../authority-set.mjs';

type PolicyBranchView = Record<string, unknown>;
type PolicyView = { version: unknown; default: unknown; branches: unknown };
// These erased views describe operations on caller objects; each mutable
// property read remains unknown and no cast supplies validation.
export interface ResolvedCiPolicy {
  baseBranch: string;
  mode: unknown;
  model?: unknown;
  reasoningEffort?: unknown;
  policyVersion?: unknown;
  legacyAuthorityFilesBase64?: string;
  legacyPromptPath?: unknown;
  legacySchemaPath?: unknown;
  legacyValidationPath?: unknown;
  authorityManifestPath?: unknown;
  authorityLimitsBase64?: string;
  authorityProfile?: string;
  ownerAdditionVersion?: 2;
  ownerAdditionAuthorityId?: unknown;
  ownerAdditionAuthorityPath?: unknown;
  ownerAdditionGrade?: unknown;
  ownerAdditionPromptPath?: unknown;
  ownerAdditionSchemaPath?: unknown;
  adoptionEvidenceProducer?: unknown;
  adoptionEvidenceWorkflowPath?: unknown;
  adoptionEvidenceJobName?: unknown;
  ownerAmendmentVersion?: unknown;
  ownerAmendmentGrade?: unknown;
  ownerAmendmentScope?: unknown;
  ownerAmendmentTriggerProfile?: unknown;
  ownerAmendmentAuthorityId?: unknown;
  ownerAmendmentAuthorityPath?: unknown;
  ownerAmendmentEvidenceProducer?: unknown;
  ownerAmendmentTagNamespace?: unknown;
  ownerAmendmentMaxPromptBytes?: unknown;
  provider?: unknown;
  thinkingLevel?: unknown;
  executionSelection?: 'policy';
  reviewJobTimeoutMinutes?: unknown;
  reviewStepTimeoutMinutes?: unknown;
  codexArgs?: string;
  executionSettingsBase64?: string;
  [key: string]: unknown;
}

const MODES = new Set(['enforced', 'local-only', 'procedural']);
const EFFORTS = new Set(['minimal', 'low', 'medium', 'high', 'xhigh', 'max', 'ultra']);
const AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;
const OWNER_AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/;
const OWNER_SCHEMA_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.json$/;
const ADOPTION_WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/;
const ADOPTION_JOB_NAME = /^[A-Za-z0-9][A-Za-z0-9 ._-]{0,63} \/ [A-Za-z0-9_][A-Za-z0-9 ._-]{0,63}$/;
const AMENDMENT_TAG_NAMESPACE = 'refs/tags/architecture-gatekeeper/amendments';
const OWNER_AMENDMENT_TRIGGER_PROFILES = new Set(['completed-block-v1', 'completed-owner-decision-self-v1']);
const LEGACY_AUTHORITY_PATH = /^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+$/;
const REVIEW_JOB_TIMEOUT_MAX = 360;
const REVIEW_STEP_TIMEOUT_MAX = 359;

function validateCodexExecutionSelection(selection: PolicyBranchView, label: string): void {
  requireOnlyKeys(selection, new Set(['reviewJobTimeoutMinutes', 'reviewStepTimeoutMinutes', 'codexProfile']), `${label} execution`);
  if (Object.keys(selection).length !== 3 ||
      !Number.isSafeInteger(selection.reviewJobTimeoutMinutes as number) || ((selection as PolicyBranchView).reviewJobTimeoutMinutes as number) < 1 ||
      ((selection as PolicyBranchView).reviewJobTimeoutMinutes as number) > REVIEW_JOB_TIMEOUT_MAX ||
      !Number.isSafeInteger((selection as PolicyBranchView).reviewStepTimeoutMinutes as number) || ((selection as PolicyBranchView).reviewStepTimeoutMinutes as number) < 1 ||
      ((selection as PolicyBranchView).reviewStepTimeoutMinutes as number) > REVIEW_STEP_TIMEOUT_MAX ||
      ((selection as PolicyBranchView).reviewJobTimeoutMinutes as number) <= ((selection as PolicyBranchView).reviewStepTimeoutMinutes as number) ||
      !['standard', 'flex'].includes((selection as PolicyBranchView).codexProfile as string)) {
    throw new Error(`Invalid ${label} Codex execution selection`);
  }
}

function resolvedCodexExecutionSelection(selection: PolicyBranchView | undefined, reasoningEffort: unknown): PolicyBranchView {
  if (!selection) return {};
  const args = ['--ephemeral', '-c', 'project_doc_max_bytes=0'];
  if ((selection as PolicyBranchView).codexProfile === 'flex') args.push('-c', "service_tier='flex'");
  args.push('--json');
  return {
    executionSelection: 'policy',
    reviewJobTimeoutMinutes: (selection as PolicyBranchView).reviewJobTimeoutMinutes,
    reviewStepTimeoutMinutes: (selection as PolicyBranchView).reviewStepTimeoutMinutes,
    codexArgs: JSON.stringify(args),
    executionSettingsBase64: Buffer.from(JSON.stringify({
      reasoningEffort, codexArgs: args,
      reviewJobTimeoutMinutes: (selection as PolicyBranchView).reviewJobTimeoutMinutes,
      reviewStepTimeoutMinutes: (selection as PolicyBranchView).reviewStepTimeoutMinutes,
    }), 'utf8').toString('base64'),
  };
}

function isRecord(value: unknown): value is PolicyBranchView {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireOnlyKeys(value: unknown, allowed: Set<string>, label: string): asserts value is PolicyBranchView {
  if (!isRecord(value)) throw new Error(`Invalid ${label}`);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) throw new Error(`Unknown ${label} field: ${key}`);
  }
}

function validateV6Branch(branch: PolicyBranchView, label: string): void {
  if (!isRecord(branch) || !MODES.has((branch as PolicyBranchView).mode as string)) throw new Error(`Invalid ${label} mode`);
  if ((branch as PolicyBranchView).mode === 'local-only') {
    requireOnlyKeys(branch, new Set(['mode']), label);
    return;
  }
  if ((branch as PolicyBranchView).mode !== 'enforced') throw new Error(`${label} v6 supports only enforced or local-only mode`);
  if ((branch as PolicyBranchView).provider !== 'codex' && (branch as PolicyBranchView).provider !== 'gemini') throw new Error(`${label} v6 requires provider codex or gemini`);

  const common = ['mode', 'provider', 'model', 'authorityManifestPath', 'authorityLimits', 'execution'];
  const providerSetting = (branch as PolicyBranchView).provider === 'codex' ? 'reasoningEffort' : 'thinkingLevel';
  const allowed = new Set([...common, providerSetting]);
  requireOnlyKeys(branch, allowed, label);
  const expectedSize = allowed.size - (Object.hasOwn(branch, 'execution') ? 0 : 1);
  if (Object.keys(branch).length !== expectedSize) throw new Error(`${label} v6 requires its complete provider and Authority Set selection`);
  if (typeof (branch as PolicyBranchView).model !== 'string' || !/^[A-Za-z0-9._-]+$/.test((branch as PolicyBranchView).model as string)) {
    throw new Error(`Enforced ${label} requires a valid model`);
  }
  if ((branch as PolicyBranchView).provider === 'codex') {
    if (/^gemini(?:-|$)/i.test((branch as PolicyBranchView).model as string) || !EFFORTS.has((branch as PolicyBranchView).reasoningEffort as string)) {
      throw new Error(`Invalid Codex model or reasoning effort for ${label}`);
    }
    if (Object.hasOwn(branch, 'execution')) validateCodexExecutionSelection((branch as PolicyBranchView).execution as PolicyBranchView, label);
  } else if ((branch as PolicyBranchView).model !== 'gemini-3.8-flash' || (branch as PolicyBranchView).thinkingLevel !== 'MEDIUM') {
    throw new Error(`Invalid Gemini model or thinking level for ${label}`);
  } else if (Object.hasOwn(branch, 'execution')) {
    throw new Error(`${label} execution selection is only supported for Codex`);
  }
  if (typeof (branch as PolicyBranchView).authorityManifestPath !== 'string' || ((branch as PolicyBranchView).authorityManifestPath as string).length > 240 ||
      !AUTHORITY_PATH.test((branch as PolicyBranchView).authorityManifestPath as string) || ((branch as PolicyBranchView).authorityManifestPath as string).split('/').some(part => part === '.' || part === '..')) {
    throw new Error(`Invalid Authority Set manifest path for ${label}`);
  }
  validateAuthorityLimits((branch as PolicyBranchView).authorityLimits);
}

function validateBranch(branch: PolicyBranchView, label: string, version: number): void {
  if (version === 6) return validateV6Branch(branch, label);
  const allowed = version === 1 ? ['mode', 'model', 'reasoningEffort', 'authorityFiles', 'promptPath', 'schemaPath', 'validationPath', 'execution'] :
    ['mode', 'model', 'reasoningEffort', 'authorityManifestPath', 'authorityLimits', 'execution', 'ownerAddition', ...(version === 2 ? ['ownerAmendment'] : []), ...(version === 5 ? ['adoptionEvidence'] : [])];
  requireOnlyKeys(branch, new Set(allowed), label);
  if (!MODES.has((branch as PolicyBranchView).mode as string)) throw new Error(`Invalid ${label} mode`);
  if ((branch as PolicyBranchView).mode === 'local-only') {
    if (Object.keys(branch).length !== 1) throw new Error(`Invalid ${label}`);
    return;
  }
  if (version === 5 && (branch as PolicyBranchView).mode !== 'procedural') throw new Error(`${label} v5 requires procedural mode`);
  if (version !== 5 && (branch as PolicyBranchView).mode === 'procedural') throw new Error(`${label} procedural mode requires CI policy v5`);
  if (Object.hasOwn(branch, 'execution')) validateCodexExecutionSelection((branch as PolicyBranchView).execution as PolicyBranchView, label);
  if (typeof (branch as PolicyBranchView).model !== 'string' || !/^[A-Za-z0-9._-]+$/.test((branch as PolicyBranchView).model as string)) {
    throw new Error(`${(branch as PolicyBranchView).mode === 'procedural' ? 'Procedural' : 'Enforced'} ${label} requires a valid model`);
  }
  if (!EFFORTS.has((branch as PolicyBranchView).reasoningEffort as string)) throw new Error(`Invalid reasoning effort for ${label}`);
  if (version === 1) {
    if (typeof (branch as PolicyBranchView).promptPath !== 'string' || ((branch as PolicyBranchView).promptPath as string).length > 240 ||
        !OWNER_AUTHORITY_PATH.test((branch as PolicyBranchView).promptPath as string) || ((branch as PolicyBranchView).promptPath as string).split('/').some(part => part === '.' || part === '..') ||
        typeof (branch as PolicyBranchView).schemaPath !== 'string' || ((branch as PolicyBranchView).schemaPath as string).length > 240 ||
        !OWNER_SCHEMA_PATH.test((branch as PolicyBranchView).schemaPath as string) || ((branch as PolicyBranchView).schemaPath as string).split('/').some(part => part === '.' || part === '..')) {
      throw new Error(`Enforced ${label} requires base-selected promptPath and schemaPath`);
    }
    if (!Object.hasOwn(branch, 'validationPath') || ((branch as PolicyBranchView).validationPath !== null &&
        (typeof (branch as PolicyBranchView).validationPath !== 'string' || ((branch as PolicyBranchView).validationPath as string).length > 240 ||
          !OWNER_SCHEMA_PATH.test((branch as PolicyBranchView).validationPath as string) ||
          ((branch as PolicyBranchView).validationPath as string).split('/').some(part => part === '.' || part === '..')))) {
      throw new Error(`Enforced ${label} requires an explicit base-selected validationPath or null`);
    }
    if (!Array.isArray((branch as PolicyBranchView).authorityFiles) || ((branch as PolicyBranchView).authorityFiles as unknown[]).length < 1 || ((branch as PolicyBranchView).authorityFiles as unknown[]).length > 16 ||
        new Set((branch as PolicyBranchView).authorityFiles as unknown[]).size !== ((branch as PolicyBranchView).authorityFiles as unknown[]).length ||
        ((branch as PolicyBranchView).authorityFiles as unknown[]).some((path: unknown) => typeof path !== 'string' || (path as string).length > 240 ||
          !LEGACY_AUTHORITY_PATH.test(path as string) || (path as string).split('/').some(part => part === '.' || part === '..'))) {
      throw new Error(`Enforced ${label} requires explicit base-selected authorityFiles`);
    }
  }
  if (version === 2 || version === 4 || version === 5) {
    if (Object.hasOwn(branch, 'ownerAddition')) {
      requireOnlyKeys((branch as PolicyBranchView).ownerAddition, new Set(['grade', 'authorityPath', 'promptPath', 'schemaPath', ...([4, 5].includes(version) ? ['version', 'authorityId'] : [])]), `${label} owner addition`);
      if ([4, 5].includes(version) && (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).version !== 2 ||
          !/^[a-z][a-z0-9-]{0,63}$/.test((((branch as PolicyBranchView).ownerAddition as PolicyBranchView).authorityId || '') as string))) {
        throw new Error(`${label} v${version} requires version 2 owner addition and an affected authorityId`);
      }
      if (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).grade !== 'G0' ||
          typeof ((branch as PolicyBranchView).ownerAddition as PolicyBranchView).authorityPath !== 'string' ||
          (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).authorityPath as string).length > 240 ||
          !OWNER_AUTHORITY_PATH.test(((branch as PolicyBranchView).ownerAddition as PolicyBranchView).authorityPath as string) ||
          (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).authorityPath as string).split('/').some(part => part === '.' || part === '..') ||
          typeof ((branch as PolicyBranchView).ownerAddition as PolicyBranchView).promptPath !== 'string' ||
          (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).promptPath as string).length > 240 ||
          !OWNER_AUTHORITY_PATH.test(((branch as PolicyBranchView).ownerAddition as PolicyBranchView).promptPath as string) ||
          (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).promptPath as string).split('/').some(part => part === '.' || part === '..') ||
          typeof ((branch as PolicyBranchView).ownerAddition as PolicyBranchView).schemaPath !== 'string' ||
          (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).schemaPath as string).length > 240 ||
          !OWNER_SCHEMA_PATH.test(((branch as PolicyBranchView).ownerAddition as PolicyBranchView).schemaPath as string) ||
          (((branch as PolicyBranchView).ownerAddition as PolicyBranchView).schemaPath as string).split('/').some(part => part === '.' || part === '..')) {
        throw new Error(`Invalid ${label} owner addition`);
      }
    }
    const hasPath = Object.hasOwn(branch, 'authorityManifestPath');
    const hasLimits = Object.hasOwn(branch, 'authorityLimits');
    if (hasPath !== hasLimits) throw new Error(`${label} must specify both Authority Set path and limits`);
    if (Object.hasOwn(branch, 'ownerAddition') && !hasPath) {
      throw new Error(`${label} owner addition requires a protected Authority Set`);
    }
    if ([4, 5].includes(version) && !Object.hasOwn(branch, 'ownerAddition')) throw new Error(`${label} v${version} requires explicit multi-document owner addition`);
    if (hasPath) {
      if (typeof (branch as PolicyBranchView).authorityManifestPath !== 'string' || ((branch as PolicyBranchView).authorityManifestPath as string).length > 240 ||
          !AUTHORITY_PATH.test((branch as PolicyBranchView).authorityManifestPath as string) || ((branch as PolicyBranchView).authorityManifestPath as string).split('/').some(part => part === '.' || part === '..')) {
        throw new Error(`Invalid Authority Set manifest path for ${label}`);
      }
      validateAuthorityLimits((branch as PolicyBranchView).authorityLimits, [4, 5].includes(version) ? MULTI_AUTHORITY_PROFILE : 'v1');
    }
  }
  if (version === 5) {
    const evidence = (branch as PolicyBranchView).adoptionEvidence as PolicyBranchView;
    requireOnlyKeys(evidence, new Set(['producer', 'workflowPath', 'jobName']), `${label} adoption evidence`);
    if ((branch as PolicyBranchView).mode !== 'procedural' || evidence.producer !== 'github-actions' ||
        typeof evidence.workflowPath !== 'string' || (evidence.workflowPath as string).length > 240 ||
        !ADOPTION_WORKFLOW_PATH.test(evidence.workflowPath as string) ||
        (evidence.workflowPath as string).split('/').some(part => part === '.' || part === '..') ||
        typeof evidence.jobName !== 'string' || (evidence.jobName as string).length > 131 || !ADOPTION_JOB_NAME.test(evidence.jobName as string)) {
      throw new Error(`Invalid ${label} adoption evidence`);
    }
  } else if (Object.hasOwn(branch, 'adoptionEvidence')) {
    throw new Error(`${label} adoption evidence requires CI policy v5`);
  }
  if (Object.hasOwn(branch, 'ownerAmendment')) {
    const amendment = (branch as PolicyBranchView).ownerAmendment as PolicyBranchView;
    requireOnlyKeys(amendment, new Set(['version', 'grade', 'scope', 'triggerProfile', 'authorityId', 'authorityPath', 'evidenceProducer', 'tagNamespace', 'maxPromptBytes']), `${label} owner amendment`);
    if (version !== 2 || (branch as PolicyBranchView).mode !== 'enforced' || !Object.hasOwn(branch, 'authorityManifestPath') || amendment.version !== 1 || amendment.grade !== 'G0' ||
        amendment.scope !== 'authority-only' || !OWNER_AMENDMENT_TRIGGER_PROFILES.has(amendment.triggerProfile as string) ||
        !/^[a-z][a-z0-9-]{0,63}$/.test(((amendment.authorityId || '') as string)) ||
        typeof amendment.authorityPath !== 'string' || (amendment.authorityPath as string).length > 240 ||
        !OWNER_AUTHORITY_PATH.test(amendment.authorityPath as string) || (amendment.authorityPath as string).split('/').some(part => part === '.' || part === '..') ||
        amendment.evidenceProducer !== 'github-actions-attestation' || amendment.tagNamespace !== AMENDMENT_TAG_NAMESPACE ||
        (amendment.triggerProfile === 'completed-owner-decision-self-v1' && !Object.hasOwn(amendment, 'maxPromptBytes')) ||
        (Object.hasOwn(amendment, 'maxPromptBytes') && (!Number.isSafeInteger(amendment.maxPromptBytes) ||
          (amendment.maxPromptBytes as number) < 1 || (amendment.maxPromptBytes as number) > 1_048_576))) {
      throw new Error(`Invalid ${label} owner amendment selection`);
    }
  }
}

export function resolveCiPolicy(policy: unknown, baseBranch: string): ResolvedCiPolicy {
  if (!isRecord(policy) || ![1, 2, 4, 5, 6].includes((policy as PolicyView).version as number)) throw new Error('Unsupported Architecture Gate CI policy version');
  requireOnlyKeys(policy, new Set(['version', 'default', 'branches']), 'CI policy');
  if (!baseBranch || typeof baseBranch !== 'string') throw new Error('A base branch is required');
  if (!isRecord((policy as PolicyView).default)) throw new Error('CI policy requires default');
  if (!isRecord((policy as PolicyView).branches)) {
    throw new Error('CI policy requires a branches object');
  }
  validateBranch((policy as PolicyView).default as PolicyBranchView, 'CI policy default', (policy as PolicyView).version as number);
  for (const [branchName, branch] of Object.entries((policy as PolicyView).branches as PolicyBranchView)) {
    validateBranch(branch as PolicyBranchView, `CI policy branch ${branchName}`, (policy as PolicyView).version as number);
  }
  const selected = (Object.hasOwn((policy as PolicyView).branches as object, baseBranch) ? ((policy as PolicyView).branches as PolicyBranchView)[baseBranch] : (policy as PolicyView).default) as PolicyBranchView;
  if ((policy as PolicyView).version === 6) {
    if (selected.mode === 'local-only') return { baseBranch, mode: 'local-only', policyVersion: 6 };
    return {
      baseBranch,
      mode: 'enforced',
      policyVersion: 6,
      provider: selected.provider,
      model: selected.model,
      ...(selected.provider === 'codex' ? { reasoningEffort: selected.reasoningEffort } : { thinkingLevel: selected.thinkingLevel }),
      authorityManifestPath: selected.authorityManifestPath,
      authorityLimitsBase64: Buffer.from(JSON.stringify(validateAuthorityLimits(selected.authorityLimits))).toString('base64'),
      ...(selected.provider === 'codex' ? resolvedCodexExecutionSelection(selected.execution as PolicyBranchView, selected.reasoningEffort) : {}),
    };
  }
  const result: ResolvedCiPolicy = selected.mode === 'local-only'
    ? { baseBranch, mode: 'local-only', model: '', reasoningEffort: '' }
    : { baseBranch, mode: selected.mode, model: selected.model, reasoningEffort: selected.reasoningEffort };
  if ((policy as PolicyView).version === 1 && selected.mode === 'enforced') {
    result.policyVersion = 1;
    result.legacyAuthorityFilesBase64 = Buffer.from(JSON.stringify(selected.authorityFiles)).toString('base64');
    result.legacyPromptPath = selected.promptPath;
    result.legacySchemaPath = selected.schemaPath;
    result.legacyValidationPath = selected.validationPath ?? '';
  }
  if (selected.authorityManifestPath) {
    result.authorityManifestPath = selected.authorityManifestPath;
    const profile = [4, 5].includes((policy as PolicyView).version as number) ? MULTI_AUTHORITY_PROFILE : 'v1';
    result.authorityLimitsBase64 = Buffer.from(JSON.stringify(validateAuthorityLimits(selected.authorityLimits, profile))).toString('base64');
    if ([4, 5].includes((policy as PolicyView).version as number)) result.authorityProfile = profile;
  }
  if (selected.ownerAddition) {
    if ([4, 5].includes((policy as PolicyView).version as number)) {
      result.policyVersion = (policy as PolicyView).version;
      result.ownerAdditionVersion = 2;
      result.ownerAdditionAuthorityId = (selected.ownerAddition as PolicyBranchView).authorityId;
    }
    result.ownerAdditionAuthorityPath = (selected.ownerAddition as PolicyBranchView).authorityPath;
    result.ownerAdditionGrade = (selected.ownerAddition as PolicyBranchView).grade;
    result.ownerAdditionPromptPath = (selected.ownerAddition as PolicyBranchView).promptPath;
    result.ownerAdditionSchemaPath = (selected.ownerAddition as PolicyBranchView).schemaPath;
  }
  if ((policy as PolicyView).version === 5 && selected.mode === 'procedural') {
    result.adoptionEvidenceProducer = (selected.adoptionEvidence as PolicyBranchView).producer;
    result.adoptionEvidenceWorkflowPath = (selected.adoptionEvidence as PolicyBranchView).workflowPath;
    result.adoptionEvidenceJobName = (selected.adoptionEvidence as PolicyBranchView).jobName;
  }
  if (selected.ownerAmendment) {
    result.ownerAmendmentVersion = (selected.ownerAmendment as PolicyBranchView).version;
    result.ownerAmendmentGrade = (selected.ownerAmendment as PolicyBranchView).grade;
    result.ownerAmendmentScope = (selected.ownerAmendment as PolicyBranchView).scope;
    result.ownerAmendmentTriggerProfile = (selected.ownerAmendment as PolicyBranchView).triggerProfile;
    result.ownerAmendmentAuthorityId = (selected.ownerAmendment as PolicyBranchView).authorityId;
    result.ownerAmendmentAuthorityPath = (selected.ownerAmendment as PolicyBranchView).authorityPath;
    result.ownerAmendmentEvidenceProducer = (selected.ownerAmendment as PolicyBranchView).evidenceProducer;
    result.ownerAmendmentTagNamespace = (selected.ownerAmendment as PolicyBranchView).tagNamespace;
    if (Object.hasOwn(selected.ownerAmendment, 'maxPromptBytes')) {
      result.ownerAmendmentMaxPromptBytes = (selected.ownerAmendment as PolicyBranchView).maxPromptBytes;
    }
  }
  if (selected.mode !== 'local-only') Object.assign(result, resolvedCodexExecutionSelection(selected.execution as PolicyBranchView, selected.reasoningEffort));
  return result;
}

export function parseCiPolicyJson(source: string): unknown {
  rejectDuplicateJsonKeys(source, 'CI policy');
  return JSON.parse(source);
}

