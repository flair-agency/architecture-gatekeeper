import { trustedGitHubOutputPath } from '../../../src/github-runner-env.mjs';

const path = trustedGitHubOutputPath('/tmp/attacker-selected-output');
const wrongReturn: number = trustedGitHubOutputPath();
const falselyOptional: undefined = trustedGitHubOutputPath();
void [path, wrongReturn, falselyOptional];
