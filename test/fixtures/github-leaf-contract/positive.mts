import { execFileSync } from 'node:child_process';
import { createGitHubCliRunner } from '../../../src/github-cli-runner.mts';
import { matchesGitHubAssociatedRepository } from '../../../src/github-associated-repository.mts';

declare const repo: unknown;
declare const expectedRepository: unknown;
declare const expectedRepositoryId: unknown;
matchesGitHubAssociatedRepository(repo, { repository: expectedRepository, repositoryId: expectedRepositoryId });
const runner = createGitHubCliRunner(execFileSync);
const output: unknown = runner('gh', ['version']);
void output;


declare const observedArgs: readonly unknown[];
const readonlyStdio = ['pipe', 'pipe', 'pipe'] as const;
runner('gh', observedArgs, { encoding: 'utf8', stdio: readonlyStdio, timeout: 30_000 });
