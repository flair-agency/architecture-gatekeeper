import test from 'node:test';
import assert from 'node:assert/strict';
import { trustedGitHubOutputPath } from '../src/github-runner-env.mjs';

test('runner boundary reads only GITHUB_OUTPUT and offers no caller-selected input', () => {
  const original = process.env.GITHUB_OUTPUT;
  const other = process.env.OTHER_OUTPUT;
  try {
    process.env.GITHUB_OUTPUT = '/runner/output';
    process.env.OTHER_OUTPUT = '/attacker/output';
    assert.equal(trustedGitHubOutputPath.length, 0);
    assert.equal(trustedGitHubOutputPath('/attacker/output'), '/runner/output');
    delete process.env.GITHUB_OUTPUT;
    assert.throws(() => trustedGitHubOutputPath(), /GITHUB_OUTPUT is unavailable/);
    process.env.GITHUB_OUTPUT = '';
    assert.throws(() => trustedGitHubOutputPath(), /GITHUB_OUTPUT is unavailable/);
  } finally {
    if (original === undefined) delete process.env.GITHUB_OUTPUT; else process.env.GITHUB_OUTPUT = original;
    if (other === undefined) delete process.env.OTHER_OUTPUT; else process.env.OTHER_OUTPUT = other;
  }
});
