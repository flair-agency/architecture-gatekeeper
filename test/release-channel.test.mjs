import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  captureStableLatest,
  classifyRelease,
  verifyRegistryReadback,
} from '../scripts/release-channel.mjs';

const releaseSha = 'a'.repeat(40);
const archiveIntegrity = 'sha512-YWJjZA==';

function release(overrides = {}) {
  return {
    releaseTag: 'v0.5.1',
    packageVersion: '0.5.1',
    releaseRef: 'refs/tags/v0.5.1',
    releaseSha,
    checkoutSha: releaseSha,
    ...overrides,
  };
}

function registry(overrides = {}) {
  return {
    version: '0.5.2-preview.1',
    channel: 'preview',
    integrity: archiveIntegrity,
    actualVersion: '0.5.2-preview.1',
    actualIntegrity: archiveIntegrity,
    distTags: { latest: '0.5.1', preview: '0.5.2-preview.1' },
    stableLatestBefore: '0.5.1',
    ...overrides,
  };
}

test('classifies exact stable and supported preview tags', () => {
  assert.deepEqual(classifyRelease(release()), {
    version: '0.5.1', tag: 'v0.5.1', sha: releaseSha, channel: 'latest',
  });
  assert.equal(classifyRelease(release({
    releaseTag: 'v0.5.2-preview.3',
    packageVersion: '0.5.2-preview.3',
    releaseRef: 'refs/tags/v0.5.2-preview.3',
  })).channel, 'preview');
});

test('rejects unsupported or inconsistent release identity and ref', () => {
  for (const invalid of [
    release({ releaseTag: 'v0.5.1-rc.1', packageVersion: '0.5.1-rc.1', releaseRef: 'refs/tags/v0.5.1-rc.1' }),
    release({ releaseTag: 'v0.5.2-preview.0', packageVersion: '0.5.2-preview.0', releaseRef: 'refs/tags/v0.5.2-preview.0' }),
    release({ releaseTag: 'v0.5.02', packageVersion: '0.5.02', releaseRef: 'refs/tags/v0.5.02' }),
    release({ releaseTag: 'v0.5.2' }),
    release({ releaseRef: 'refs/heads/main' }),
    release({ releaseSha: 'b'.repeat(40) }),
    release({ releaseSha: 'not-a-commit' }),
  ]) {
    assert.throws(() => classifyRelease(invalid));
  }
});

test('captures only an existing stable registry latest tag', () => {
  assert.equal(captureStableLatest({ latest: '0.5.1', preview: '0.5.2-preview.1' }), '0.5.1');
  assert.throws(() => captureStableLatest({ preview: '0.5.2-preview.1' }));
  assert.throws(() => captureStableLatest({ latest: '0.5.2-preview.1' }));
});

test('verifies exact preview version, archive integrity and preview channel while preserving latest', () => {
  assert.equal(verifyRegistryReadback(registry()), true);
  assert.throws(() => verifyRegistryReadback(registry({ actualVersion: '0.5.2-preview.2' })), /version/);
  assert.throws(() => verifyRegistryReadback(registry({ actualIntegrity: 'sha512-wrong' })), /integrity/);
  assert.throws(() => verifyRegistryReadback(registry({ channel: 'latest' })), /channel/);
  assert.throws(() => verifyRegistryReadback(registry({ distTags: { latest: '0.5.2-preview.1', preview: '0.5.2-preview.1' } })), /stable latest/);
  assert.throws(() => verifyRegistryReadback(registry({ distTags: { latest: '0.5.1', preview: '0.5.2-preview.2' } })), /preview channel/);
});

test('verifies stable publication promotes only its exact version to latest', () => {
  assert.equal(verifyRegistryReadback({
    version: '0.5.2',
    channel: 'latest',
    integrity: archiveIntegrity,
    actualVersion: '0.5.2',
    actualIntegrity: archiveIntegrity,
    distTags: { latest: '0.5.2', preview: '0.5.2-preview.1' },
  }), true);
  assert.throws(() => verifyRegistryReadback({
    version: '0.5.2',
    channel: 'latest',
    integrity: archiveIntegrity,
    actualVersion: '0.5.2',
    actualIntegrity: archiveIntegrity,
    distTags: { latest: '0.5.1' },
  }), /latest channel/);
});

test('publish workflow validates tag identity and always passes the derived channel explicitly', () => {
  const workflow = readFileSync(new URL('../.github/workflows/publish-package.yml', import.meta.url), 'utf8');
  assert.match(workflow, /tags:\s*\['v\*'\]/);
  assert.match(workflow, /node scripts\/release-channel\.mjs validate/);
  assert.match(workflow, /npm publish "\$ARCHIVE_PATH" --ignore-scripts --tag "\$RELEASE_CHANNEL"/);
  assert.match(workflow, /Capture stable latest before preview publish[\s\S]*?if: steps\.release\.outputs\.channel == 'preview'/);
  assert.match(workflow, /node scripts\/release-channel\.mjs verify-registry/);
});
