import { trustedGitHubOutputPath } from '../../../src/github-runner-env.mts';

const path = trustedGitHubOutputPath('/tmp/attacker-selected-output');
const wrongReturn: number = trustedGitHubOutputPath();
const falselyOptional: undefined = trustedGitHubOutputPath();
void [path, wrongReturn, falselyOptional];

import { trustedGitHubOutputPath as implementation } from '../../../src/github/github-runner-env.mts';
const selectedImplementationPath = implementation('/tmp/attacker-selected-output');
const wrongImplementationReturn: number = implementation();
const falselyOptionalImplementation: undefined = implementation();
void [selectedImplementationPath, wrongImplementationReturn, falselyOptionalImplementation];
