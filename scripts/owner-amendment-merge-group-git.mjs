import { execFileSync } from 'node:child_process';

// Shared process boundary for the two merge-group CLIs. Command meaning and
// output interpretation remain with each caller.
export const runOwnerAmendmentMergeGroupGit = args => execFileSync('git',
  ['-C', process.env.GITHUB_WORKSPACE, ...args], {
    encoding: 'buffer', maxBuffer: 2 * 1024 * 1024, timeout: 30_000,
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GIT_NO_REPLACE_OBJECTS: '1' },
  });
