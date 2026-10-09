import { execFileSync } from 'node:child_process';
import { createGitHubCliRunner } from '../../../src/github-cli-runner.mjs';
import { matchesGitHubAssociatedRepository } from '../../../src/github-associated-repository.mjs';

declare const repo: unknown;
declare const expectedRepository: unknown;
declare const expectedRepositoryId: unknown;
matchesGitHubAssociatedRepository(repo, { repository: expectedRepository, repositoryId: expectedRepositoryId });
const runner = createGitHubCliRunner(execFileSync);
const output: unknown = runner('gh', ['version']);
void output;
