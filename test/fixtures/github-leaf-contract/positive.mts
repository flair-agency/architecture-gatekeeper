import { execFileSync } from 'node:child_process';
import { createGitHubCliRunner } from '../../../src/github-cli-runner.mjs';
import { matchesGitHubAssociatedRepository } from '../../../src/github-associated-repository.mjs';
import { verifyOwnerAmendmentBlockEvidence } from '../../../src/owner-amendment-attestation.mjs';

declare const repo: unknown;
declare const expectedRepository: unknown;
declare const expectedRepositoryId: unknown;
matchesGitHubAssociatedRepository(repo, { repository: expectedRepository, repositoryId: expectedRepositoryId });
const runner = createGitHubCliRunner(execFileSync);
const output: unknown = runner('gh', ['version']);
void output;

declare const recordBytes: unknown;
declare const bundleBytes: unknown;
declare const expected: unknown;
verifyOwnerAmendmentBlockEvidence({ recordBytes, bundleBytes, expected, runGh: runner });

declare const observedArgs: readonly unknown[];
const readonlyStdio = ['pipe', 'pipe', 'pipe'] as const;
runner('gh', observedArgs, { encoding: 'utf8', stdio: readonlyStdio, timeout: 30_000 });
