#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveRunnerTempDirectory, readRunnerTempFile, writeRunnerTempFile } from '../src/runner-temp-path.mjs';
import { createGitHubAuthoritySource } from '../src/github-authority-source.mjs';
import { prepareOwnerAmendmentMergeGroupOrdinaryReview,
  validateOwnerAmendmentMergeGroupOrdinaryDecision } from '../src/owner-amendment-merge-group-ordinary-review.mjs';

const fail = message => { throw new Error(`Owner amendment merge-group ordinary review: ${message}`); };
const tempDir = () => resolveRunnerTempDirectory('owner-amendment-merge-group');
const git = args => execFileSync('git', ['-C', process.env.GITHUB_WORKSPACE, ...args], {
  encoding: 'buffer', maxBuffer: 2 * 1024 * 1024, timeout: 30_000,
  stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
});

async function prepare() {
  if (process.env.GITHUB_REPOSITORY !== 'flair-agency/architecture-gatekeeper' ||
      !/^[a-f0-9]{40}$/.test(process.env.BASE_SHA ?? '') || !/^[a-f0-9]{40}$/.test(process.env.B_SHA ?? '') ||
      !process.env.GITHUB_WORKSPACE || !process.env.GH_TOKEN || !process.env.GITHUB_OUTPUT) {
    fail('protected self repository, exact base/B, workspace, token, or output path is invalid.');
  }
  const eventDir = tempDir();
  const event = JSON.parse(readRunnerTempFile(eventDir, 'event.json', 262_144).toString('utf8'));
  if (event?.action !== 'checks_requested' || event?.merge_group?.base_ref !== 'refs/heads/main' ||
      event?.merge_group?.base_sha !== process.env.BASE_SHA) {
    fail('verified output tuple differs from the protected merge-group event.');
  }
  const prepared = await prepareOwnerAmendmentMergeGroupOrdinaryReview({ repository: process.env.GITHUB_REPOSITORY,
    baseSha: process.env.BASE_SHA, headSha: process.env.B_SHA, selfRoot: process.env.GITHUB_WORKSPACE,
    runGit: git, fetchExternal: createGitHubAuthoritySource({ token: process.env.GH_TOKEN }) });
  if (prepared.status !== 'PREPARED_FRESH_MERGE_GROUP_ORDINARY_REVIEW') fail('fresh ordinary review inputs were not prepared.');
  writeRunnerTempFile(eventDir, 'ordinary-prompt.md', prepared.prompt);
  writeRunnerTempFile(eventDir, 'ordinary-schema.json', prepared.schemaBytes);
  writeRunnerTempFile(eventDir, 'ordinary-validation.json', prepared.validationBytes);
  writeRunnerTempFile(eventDir, 'ordinary-authority.json', JSON.stringify(prepared.authority));
  writeRunnerTempFile(eventDir, 'ordinary-context.json', JSON.stringify({ repository: prepared.repository,
    baseSha: prepared.baseSha, headSha: prepared.headSha, model: prepared.model,
    reasoningEffort: prepared.reasoningEffort, inputDigests: prepared.inputDigests,
    authoritySetDigest: prepared.authority.setDigest,
    completePromptSha256: createHash('sha256').update(prepared.prompt).digest('hex'),
    schemaSha256: createHash('sha256').update(prepared.schemaBytes).digest('hex'),
    validationSha256: createHash('sha256').update(prepared.validationBytes).digest('hex'),
    authoritySha256: createHash('sha256').update(JSON.stringify(prepared.authority)).digest('hex') }));
  appendFileSync(process.env.GITHUB_OUTPUT, `model=${prepared.model}\neffort=${prepared.reasoningEffort}\n`);
  process.stdout.write(`Prepared fresh ordinary review for exact current queue tuple ${prepared.baseSha}/${prepared.headSha}.\n`);
}

function validate() {
  if (!process.env.DECISION || !/^[a-f0-9]{40}$/.test(process.env.BASE_SHA ?? '') ||
      !/^[a-f0-9]{40}$/.test(process.env.B_SHA ?? '') || !process.env.GITHUB_REPOSITORY) {
    fail('model output or exact current tuple is unavailable.');
  }
  if (Buffer.byteLength(process.env.DECISION, 'utf8') > 262_144) fail('model decision exceeds the bounded output size.');
  const eventDir = tempDir();
  const context = JSON.parse(readRunnerTempFile(eventDir, 'ordinary-context.json', 16_384).toString('utf8'));
  if (context.repository !== process.env.GITHUB_REPOSITORY || context.baseSha !== process.env.BASE_SHA || context.headSha !== process.env.B_SHA) {
    fail('prepared review inputs do not match the exact current queue tuple.');
  }
  const promptBytes = readRunnerTempFile(eventDir, 'ordinary-prompt.md', 1_048_576);
  const schemaBytes = readRunnerTempFile(eventDir, 'ordinary-schema.json', 262_144);
  const validationBytes = readRunnerTempFile(eventDir, 'ordinary-validation.json', 262_144);
  const authorityBytes = readRunnerTempFile(eventDir, 'ordinary-authority.json', 32_768);
  const sha256 = value => createHash('sha256').update(value).digest('hex');
  if (sha256(promptBytes) !== context.completePromptSha256 || sha256(schemaBytes) !== context.schemaSha256 ||
      sha256(validationBytes) !== context.validationSha256 || sha256(authorityBytes) !== context.authoritySha256) {
    fail('prepared protected review inputs changed after materialization.');
  }
  const prepared = { ...context, schemaBytes, validationBytes, authority: JSON.parse(authorityBytes.toString('utf8')) };
  const result = validateOwnerAmendmentMergeGroupOrdinaryDecision({ decisionBytes: Buffer.from(process.env.DECISION, 'utf8'),
    expected: { repository: context.repository, baseSha: process.env.BASE_SHA, headSha: process.env.B_SHA }, prepared });
  process.stdout.write(`Verified exact-tuple fresh ordinary PASS (decision SHA-256 ${result.decisionSha256}).\n`);
}

async function main(argv = process.argv.slice(2)) {
  if (argv.length !== 1 || !['prepare', 'validate'].includes(argv[0])) fail('expected prepare or validate.');
  if (argv[0] === 'prepare') await prepare();
  else validate();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
