import { trustedGitHubOutputPath } from '../../../src/github-runner-env.mjs';

const path: string = trustedGitHubOutputPath();
const zeroArgumentOperation: () => string = trustedGitHubOutputPath;
void [path, zeroArgumentOperation];
