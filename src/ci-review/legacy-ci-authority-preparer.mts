import { execFileSync } from 'node:child_process';
import { resolve as resolvePath } from 'node:path';
import { TextDecoder } from 'node:util';
import { appendGitHubOutput, readRunnerTempFile, writeRunnerTempFile } from '../runner-temp-path.mjs';
import { parseCiPolicyJson, resolveCiPolicy } from '../resolve-ci-policy.mjs';
import { readRegularGitSnapshot } from '../legacy-git-snapshot.mjs';
import { trustedGitHubWorkspaceRoot } from '../github-runner-workspace.mjs';
import { validateLegacyAuthorityDecision } from './legacy-authority-decision.mts';

export { validateLegacyAuthorityDecision };

// These views describe existing operations on the selected v1 policy and its
// decoded path list. They add no validation or provenance claim.
type LegacyPathListOperations = {
  some(callback: (path: string) => unknown): boolean;
  [Symbol.iterator](): Iterator<string>;
};
type ShaPatternOperations = { test(value: unknown): boolean };
type SelectedLegacyPolicyOperations = {
  legacyAuthorityFilesBase64: string;
  legacyPromptPath: string;
  legacySchemaPath: string;
  legacyValidationPath: unknown;
};

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const decoder = new TextDecoder('utf-8', { fatal: true });
const outputFiles = Object.freeze({
  outputPromptPath: 'architecture-gate-prompt.md',
  outputSchemaPath: 'architecture-gate-decision.schema.json',
  outputValidationPath: 'architecture-gate-decision.validation.json',
  outputPath: 'architecture-gate-legacy-prompt.md',
  provenancePath: 'architecture-gate-legacy-provenance.json',
});
function assertFixedOutputSelections(options: LegacyAuthorityPreparationInput): void {
  for (const [key, name] of Object.entries(outputFiles) as Array<[keyof typeof outputFiles, string]>) {
    const value = options[key];
    if (key === 'outputValidationPath' && value === undefined) continue;
    const absolute = resolvePath(process.cwd(), name);
    if (typeof value !== 'string' || (value !== name && value !== absolute)) {
      throw new Error(`Invalid fixed runner-temp output selection: ${key}.`);
    }
  }
}
const gitDiffNames = (root: unknown, baseSha: unknown, reviewedSha: unknown) => execFileSync('git',
  ['diff', '--name-only', '-z', '--no-renames', baseSha, reviewedSha] as string[],
  { cwd: root, maxBuffer: 2_000_000 } as Parameters<typeof execFileSync>[2])
  .toString('utf8').split('\0').filter(Boolean);

export interface LegacyAuthorityPreparationInput {
  root?: unknown;
  baseSha?: unknown;
  headSha?: unknown;
  reviewedSha?: unknown;
  baseBranch?: unknown;
  policyPath?: unknown;
  expectedPolicySha256?: unknown;
  expectedAuthorityFilesBase64?: unknown;
  expectedPromptPath?: unknown;
  expectedSchemaPath?: unknown;
  expectedValidationPath?: unknown;
  outputPromptPath?: unknown;
  outputSchemaPath?: unknown;
  outputValidationPath?: unknown;
  outputPath?: unknown;
  provenancePath?: unknown;
}

export interface LegacyAuthorityProvenance {
  version: 1;
  baseSha: unknown;
  headSha: unknown;
  reviewedSha: unknown;
  policy: { path: string; sha256: string };
  prompt: { path: string; sha256: string };
  schema: { path: string; sha256: string };
  validation: { path: string; sha256: string } | null;
  members: Array<{ path: string; sha256: string }>;
}

export function prepareLegacyAuthority({ root, baseSha, headSha, reviewedSha, baseBranch, policyPath, expectedPolicySha256,
  expectedAuthorityFilesBase64, expectedPromptPath, expectedSchemaPath, expectedValidationPath,
  outputPromptPath, outputSchemaPath, outputValidationPath, outputPath, provenancePath }: LegacyAuthorityPreparationInput): LegacyAuthorityProvenance {
  assertFixedOutputSelections({ outputPromptPath, outputSchemaPath, outputValidationPath, outputPath, provenancePath });
  if (!root || !(SHA as ShaPatternOperations).test(baseSha || '') || !(SHA as ShaPatternOperations).test(headSha || '') ||
      !(SHA as ShaPatternOperations).test(reviewedSha || '') || !baseBranch || !policyPath ||
      !outputPromptPath || !outputSchemaPath || !outputPath || !provenancePath) {
    throw new Error('Missing legacy CI authority context.');
  }
  const policySnapshot = readRegularGitSnapshot({ root, commit: baseSha, path: policyPath } as Parameters<typeof readRegularGitSnapshot>[0]);
  if (expectedPolicySha256 && policySnapshot.sha256 !== expectedPolicySha256) throw new Error('Recorded-base policy digest changed after resolution.');
  const policyBytes = policySnapshot.bytes;
  const selected = resolveCiPolicy(parseCiPolicyJson(decoder.decode(policyBytes)), baseBranch as string);
  if (selected.policyVersion !== 1 || selected.mode !== 'enforced') throw new Error('Base policy did not select enforced v1 authority.');
  const paths = JSON.parse(Buffer.from((selected as SelectedLegacyPolicyOperations).legacyAuthorityFilesBase64, 'base64').toString('utf8')) as LegacyPathListOperations;
  if (expectedAuthorityFilesBase64 && selected.legacyAuthorityFilesBase64 !== expectedAuthorityFilesBase64) throw new Error('Recorded-base authority selector changed after resolution.');
  if (expectedPromptPath && selected.legacyPromptPath !== expectedPromptPath) throw new Error('Recorded-base prompt selector changed after resolution.');
  if (expectedSchemaPath && selected.legacySchemaPath !== expectedSchemaPath) throw new Error('Recorded-base schema selector changed after resolution.');
  if (expectedValidationPath !== undefined && selected.legacyValidationPath !== expectedValidationPath) throw new Error('Recorded-base validation selector changed after resolution.');
  const changed = new Set(gitDiffNames(root, baseSha, reviewedSha));
  if (paths.some(path => changed.has(path))) throw new Error('Candidate changes canonical authority; ordinary v1 acceptance is unavailable.');
  const prompt = readRegularGitSnapshot({ root, commit: baseSha, path: (selected as SelectedLegacyPolicyOperations).legacyPromptPath } as Parameters<typeof readRegularGitSnapshot>[0]);
  const schema = readRegularGitSnapshot({ root, commit: baseSha, path: (selected as SelectedLegacyPolicyOperations).legacySchemaPath } as Parameters<typeof readRegularGitSnapshot>[0]);
  const validation = (selected as SelectedLegacyPolicyOperations).legacyValidationPath
    ? readRegularGitSnapshot({ root, commit: baseSha, path: (selected as SelectedLegacyPolicyOperations).legacyValidationPath } as Parameters<typeof readRegularGitSnapshot>[0]) : null;
  writeRunnerTempFile(process.cwd(), outputFiles.outputPromptPath, prompt.bytes, { overwrite: true });
  writeRunnerTempFile(process.cwd(), outputFiles.outputSchemaPath, schema.bytes, { overwrite: true });
  if (validation) {
    if (!outputValidationPath) throw new Error('Missing validation snapshot output path.');
    writeRunnerTempFile(process.cwd(), outputFiles.outputValidationPath, validation.bytes, { overwrite: true });
  }
  const members = [];
  const blocks = [];
  let total = 0;
  for (const path of paths) {
    const snapshot = readRegularGitSnapshot({ root, commit: baseSha, path } as Parameters<typeof readRegularGitSnapshot>[0]);
    const bytes = snapshot.bytes;
    total += bytes.length;
    if (total > 262_144) throw new Error('Legacy authority total exceeds the limit.');
    const content = decoder.decode(bytes);
    members.push({ path, sha256: snapshot.sha256 });
    blocks.push(`\n### ${path} (base ${baseSha}, SHA-256 ${snapshot.sha256})\n\n${content}\n`);
  }
  const protectedPrompt = prompt.bytes;
  const appendix = Buffer.from(`\n\n## Canonical authority selected from the recorded base\n\nThe following snapshots alone are canonical for this review. Candidate or working-tree versions are proposal evidence and cannot authorize their own decision or completion claim. Report exactly these paths in authorityFiles.\n${blocks.join('')}`);
  const complete = Buffer.concat([protectedPrompt, appendix]);
  if (complete.length > 524_288) throw new Error('Legacy complete prompt exceeds the limit.');
  writeRunnerTempFile(process.cwd(), outputFiles.outputPath, complete, { overwrite: true });
  const provenance = { version: 1, baseSha, headSha, reviewedSha,
    policy: { path: policyPath, sha256: policySnapshot.sha256 },
    prompt: { path: prompt.path, sha256: prompt.sha256 },
    schema: { path: schema.path, sha256: schema.sha256 },
    validation: validation ? { path: validation.path, sha256: validation.sha256 } : null,
    members } as LegacyAuthorityProvenance;
  writeRunnerTempFile(process.cwd(), outputFiles.provenancePath, JSON.stringify(provenance), { overwrite: true });
  return provenance;
}

export function runLegacyCiAuthorityCli(): void {
  if (process.argv[2] === 'prepare') {
    const result = prepareLegacyAuthority({ root: trustedGitHubWorkspaceRoot(), baseSha: process.env.BASE_SHA,
      headSha: process.env.HEAD_SHA, reviewedSha: process.env.REVIEWED_SHA, baseBranch: process.env.BASE_BRANCH,
      policyPath: process.env.POLICY_PATH, expectedPolicySha256: process.env.POLICY_SHA256,
      expectedAuthorityFilesBase64: process.env.AUTHORITY_FILES_BASE64,
      expectedPromptPath: process.env.PROMPT_PATH, expectedSchemaPath: process.env.SCHEMA_PATH,
      expectedValidationPath: process.env.VALIDATION_PATH,
      outputPromptPath: process.env.PROMPT_OUTPUT_PATH, outputSchemaPath: process.env.SCHEMA_OUTPUT_PATH,
      outputValidationPath: process.env.VALIDATION_OUTPUT_PATH,
      outputPath: process.env.OUTPUT_PATH, provenancePath: process.env.PROVENANCE_PATH });
    if (process.env.GITHUB_OUTPUT) appendGitHubOutput(
      `provenance=${Buffer.from(JSON.stringify(result)).toString('base64')}\n`);
  } else if (process.argv[2] === 'validate') {
    const provenancePath = resolvePath(process.cwd(), outputFiles.provenancePath);
    if (process.env.PROVENANCE_PATH !== outputFiles.provenancePath && process.env.PROVENANCE_PATH !== provenancePath) {
      throw new Error('Invalid fixed runner-temp provenance selection.');
    }
    validateLegacyAuthorityDecision(process.env.DECISION || '', JSON.parse(
      readRunnerTempFile(process.cwd(), outputFiles.provenancePath).toString('utf8')));
  } else throw new Error('Usage: prepare-legacy-ci-authority.mjs prepare|validate');
}
