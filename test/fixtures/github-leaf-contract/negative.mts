import { execFileSync } from 'node:child_process';
import { createGitHubCliRunner } from '../../../src/github-cli-runner.mjs';
import { matchesGitHubAssociatedRepository } from '../../../src/github-associated-repository.mjs';

matchesGitHubAssociatedRepository({}, { repository: 'owner/repo' });
createGitHubCliRunner('not callable');
createGitHubCliRunner(execFileSync, 'large');
createGitHubCliRunner(execFileSync, 0);
const runner = createGitHubCliRunner(execFileSync);
const narrowedOutput: string = runner('gh', []);
runner(42, []);
runner('gh', 'not an array');
runner('gh', [], { timeout: 'forever' });
void narrowedOutput;
