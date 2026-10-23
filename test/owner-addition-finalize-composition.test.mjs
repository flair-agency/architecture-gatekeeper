import assert from 'node:assert/strict';
import test from 'node:test';
import { finalizeOwnerAddition } from '../dist/owner-addition-finalize.mjs';
import { ownerAdditionFinalizeFixture } from './fixtures/owner-addition-finalize-composition.mjs';

for (const policyVersion of [5, 6]) test(`v${policyVersion} real finalizer composes selected policy, producer evidence, immutable workflow, merge and readback`, async () => {
  const fixture = ownerAdditionFinalizeFixture({ policyVersion });
  const record = await finalizeOwnerAddition(fixture.args);
  const { expected, requests } = fixture;
  assert.equal(record.selectedPolicy.version, policyVersion);
  assert.equal(record.outcome.adoption, 'valid');
  assert.equal(record.outcome.canonical, 'verified');
  assert.equal(record.candidate.repository, expected.repository);
  assert.equal(record.candidate.baseSha, expected.baseSha);
  assert.equal(record.candidate.bSha, expected.bSha);
  assert.equal(record.candidate.bTree, expected.treeSha);
  assert.deepEqual(record.merge.parents, [expected.baseSha, expected.bSha]);
  assert.equal(record.merge.sha, expected.mergeSha);
  assert.equal(record.canonical.observedSha, expected.targetSha);
  assert.equal(record.canonical.ref, expected.targetRef);
  assert.equal(record.selectedPolicy.revision, expected.baseSha);
  assert.equal(record.selectedPolicy.path, expected.policyPath);
  assert.equal(record.selectedPolicy.workflowPath, expected.callerPath);
  assert.equal(record.eligibility.producer.runId, expected.runId);
  assert.equal(record.eligibility.producer.attempt, expected.attempt);
  assert.equal(record.eligibility.producer.workflowPath, expected.callerPath);
  assert.equal(record.callerWorkflow.revision, expected.baseSha);
  assert.equal(record.gatekeeper.path, `flair-agency/architecture-gatekeeper/${expected.workflowPath}@${expected.workflowSha}`);
  assert.equal(record.gatekeeper.sha, expected.workflowSha);
  assert.equal(record.addition.authoritySha256, expected.authorityDigest);

  const routes = requests.map(request => request.route);
  assert.ok(routes.includes(`/repos/${expected.repository}/contents/${expected.policyPath}?ref=${expected.baseSha}`));
  assert.ok(routes.includes(`/repos/${expected.repository}/contents/${expected.authorityPath}?ref=${expected.bSha}`));
  assert.ok(routes.includes(`/repos/${expected.repository}/contents/${expected.authorityPath}?ref=${expected.targetSha}`));
  assert.ok(routes.includes(`/repos/flair-agency/architecture-gatekeeper/contents/${expected.workflowPath}?ref=${expected.workflowSha}`));
  assert.ok(routes.includes(`/repos/${expected.repository}/actions/runs/${expected.runId}/attempts/${expected.attempt}`));
  assert.ok(routes.includes(`/repos/${expected.repository}/actions/runs/${expected.runId}/attempts/${expected.attempt}/jobs?per_page=100`));
  assert.ok(routes.includes(`/repos/${expected.repository}/compare/${expected.mergeSha}...${expected.targetSha}?per_page=250`));
  assert.ok(requests.every(request => request.options?.headers?.authorization === 'Bearer fixture-token'));
});

test('real finalizer rejects malformed artifact tag OIDs before credential-bearing tag dispatch', async () => {
  for (const tagObjectOid of ['../commits/other', 'valid?ref=other', 'valid#fragment', 'f'.repeat(39)]) {
    const fixture = ownerAdditionFinalizeFixture({ procedurePatch: { tagObjectOid } });
    let record;
    await assert.rejects((async () => { record = await finalizeOwnerAddition(fixture.args); })(),
      /G0 tag object SHA is not a SHA-1 Git object ID/);
    assert.equal(record, undefined);
    assert.ok(fixture.requests.some(request => request.route.endsWith('/actions/artifacts/987/zip')),
      'the real verifier must decode the artifact before this finalizer boundary is reached');
    assert.ok(fixture.requests.at(-1).route.includes('/contents/docs/architecture.md?ref='));
    assert.equal(fixture.requests.some(request => request.route.includes('/git/tags/')), false);
  }
});

test('real finalizer confines optional tag-ref reads while retaining immutable adoption evidence', async () => {
  for (const segment of ['.', '..']) {
    const fixture = ownerAdditionFinalizeFixture({ procedurePatch: {
      tagRef: `refs/tags/architecture-owner-addition/${segment}/other`,
    } });
    const record = await finalizeOwnerAddition(fixture.args);
    assert.equal(record.outcome.adoption, 'valid');
    assert.equal(record.outcome.canonical, 'verified');
    assert.equal(record.addition.refReadback.status, 'unavailable');
    assert.equal(record.addition.refReadback.immutableTagObject, 'verified');
    assert.ok(fixture.requests.some(request => request.route.includes('/git/tags/')));
    assert.equal(fixture.requests.some(request => request.route.includes('/git/ref/tags/')), false);
    assert.equal(fixture.requests.some(request => request.route.endsWith('/other')), false);
  }
  const fixture = ownerAdditionFinalizeFixture({ procedurePatch: {
    tagRef: 'refs/tags/architecture-owner-addition/probe?ref=other#fragment',
  } });
  const record = await finalizeOwnerAddition(fixture.args);
  assert.equal(record.outcome.adoption, 'valid');
  assert.equal(record.addition.refReadback.status, 'unavailable');
  const request = fixture.requests.find(request => request.route.includes('/git/ref/tags/'));
  assert.equal(request.url,
    'https://api.github.com/repos/flair-agency/example/git/ref/tags/architecture-owner-addition/probe%3Fref%3Dother%23fragment');
  assert.equal(new URL(request.url).search, '');
  assert.equal(new URL(request.url).hash, '');
});

const invalidCases = [
  ['wrong-repository', /pull request is not merged into the requested repository/, /\/pulls\/129$/],
  ['wrong-base', /workflow-associated recorded base differs/, /\/actions\/runs\/9001\/attempts\/2$/],
  ['wrong-head', /workflow-associated exact B differs/, /\/actions\/runs\/9001\/attempts\/2$/],
  ['wrong-run', /workflow run ID differs/, /\/actions\/runs\/9001\/attempts\/2$/],
  ['wrong-attempt', /workflow run attempt differs/, /\/actions\/runs\/9001\/attempts\/2$/],
  ['wrong-producer', /producer job name is absent or ambiguous/, /\/jobs\?per_page=100$/],
  ['wrong-workflow', /reusable-workflow SHA differs/, /\/actions\/runs\/9001\/attempts\/2$/],
  ['wrong-second-parent', /merge commit second parent is not exact B/, /\/git\/commits\/c{40}$/],
  ['missing-evidence', /run-scoped exact-B evidence artifact is absent or ambiguous/, /\/artifacts\?per_page=100$/],
  ['readback-ref', /Readback ref is not the expected target branch/, /\/contents\/docs\/architecture\.md\?ref=d{40}$/],
  ['readback-missing-ref', /Readback ref is not the expected target branch/, /\/contents\/docs\/architecture\.md\?ref=d{40}$/],
  ['readback-authority', /Canonical authority bytes differ from the expected B authority state/, /\/contents\/docs\/architecture\.md\?ref=d{40}$/],
  ['readback-ancestry', /target ancestry response does not prove/, /\/compare\/c{40}\.\.\.d{40}\?per_page=250$/],
];

for (const policyVersion of [5, 6]) for (const [scenario, expectedError, lastRequest] of invalidCases) {
  test(`v${policyVersion} real finalizer fails closed for ${scenario} without returning a success-shaped record`, async () => {
    const fixture = ownerAdditionFinalizeFixture({ scenario, policyVersion });
    let record;
    await assert.rejects((async () => { record = await finalizeOwnerAddition(fixture.args); })(), expectedError);
    assert.equal(record, undefined);
    assert.match(fixture.requests.at(-1).route, lastRequest);
    if (scenario.startsWith('readback-')) {
      assert.ok(fixture.requests.some(request => request.route === '/repos/flair-agency/example/git/ref/heads/main'));
    }
  });
}
