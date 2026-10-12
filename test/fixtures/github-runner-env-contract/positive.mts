import { trustedGitHubOutputPath } from '../../../src/github-runner-env.mjs';

const path: string = trustedGitHubOutputPath();
const zeroArgumentOperation: () => string = trustedGitHubOutputPath;
void [path, zeroArgumentOperation];

import { trustedGitHubOutputPath as implementation } from '../../../src/github/github-runner-env.mts';
const implementationPath: string = implementation();
const implementationOperation: () => string = implementation;
void [implementationPath, implementationOperation];
