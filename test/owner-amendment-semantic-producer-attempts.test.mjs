import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMissingOwnerAmendmentTagHasNoSuccessfulSigner,
  inspectOwnerAmendmentSemanticProducerAttempts } from '../src/owner-amendment-semantic-producer-attempts.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const bHeadSha = 'a'.repeat(40);
const bBaseSha = 'b'.repeat(40);
const workflowHeadSha = bBaseSha;
const pullRequestCreatedAt = '2026-09-30T10:00:00Z';
const queueEnteredAt = '2026-09-30T12:00:00Z';
const run = (changes = {}) => ({ id: 123, run_attempt: 1, created_at: '2026-09-30T11:00:00Z',
  repository: { full_name: repository }, head_repository: { full_name: repository },
  event: 'pull_request_target', head_sha: workflowHeadSha,
  pull_requests: [{ number: 123, base: { ref: 'main', sha: bBaseSha, repo: { full_name: repository } },
    head: { sha: bHeadSha, repo: { full_name: repository } } }],
  path: '.github/workflows/self-architecture-gate.yml@refs/heads/main', status: 'completed', ...changes });
const signer = (changes = {}) => ({ id: 900, name: 'architecture-gate / owner-amendment-semantic-eligibility-signer',
  status: 'completed', conclusion: 'success', started_at: '2026-09-30T11:15:00Z',
  completed_at: '2026-09-30T11:30:00Z', ...changes });

async function inspect({ runs = [run()], jobs = [{ jobs: [] }], queueAt = queueEnteredAt } = {}) {
  let jobsIndex = 0;
  return inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt: queueAt,
    listRuns: async ({ page, perPage }) => ({ total_count: runs.length,
      workflow_runs: runs.slice((page - 1) * perPage, page * perPage) }),
    listJobs: async ({ runId, runAttempt, page, perPage }) => {
      const response = jobsIndex < jobs.length ? jobs[jobsIndex++] : { jobs: [] };
      if (response === null) return response;
      const identified = response.jobs.map((job, index) => job === null ? null : ({ ...job,
        id: job.id ?? 900 + index, run_id: job.run_id ?? runId,
        head_sha: job.head_sha ?? workflowHeadSha }));
      return { total_count: response.total_count ?? identified.length,
        jobs: response.pageJobs ?? identified.slice((page - 1) * perPage, page * perPage) };
    } });
}

const identifiedJob = (job, id, { runId = 123, runAttempt, includeRunAttempt = runAttempt !== undefined } = {}) => ({ ...job, id,
  run_id: runId, ...(includeRunAttempt ? { run_attempt: runAttempt } : {}), head_sha: workflowHeadSha });

test('ordinary exact-B run without a successful semantic signer remains eligible for NOT_APPLICABLE', async () => {
  const result = await inspect();
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
});

test('caller-qualified successful exact-B signer completed before queue entry makes a missing tag fail closed', async () => {
  const result = await inspect({ jobs: [{ jobs: [signer()] }] });
  assert.equal(result.latestSignerAttempt.job.name, 'architecture-gate / owner-amendment-semantic-eligibility-signer');
  assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
  assert.throws(() => assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(result), /successful pre-queue semantic eligibility signer/);
});

test('empty pull-request association plus successful protected-base signer fails closed when the tag is missing', async () => {
  const protectedTrigger = run({ head_sha: bBaseSha, pull_requests: [] });
  const result = await inspect({ runs: [protectedTrigger], jobs: [{ jobs: [signer({ head_sha: bBaseSha })] }] });
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
  assert.equal(result.hasAmbiguousSuccessfulSignerBeforeQueue, true);
  assert.throws(() => assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(result), /without a unique exact pull-request association/);
});

test('missing pull-request association plus successful protected-base signer fails closed', async () => {
  const protectedTrigger = run({ head_sha: bBaseSha });
  delete protectedTrigger.pull_requests;
  const result = await inspect({ runs: [protectedTrigger], jobs: [{ jobs: [signer({ head_sha: bBaseSha })] }] });
  assert.equal(result.hasAmbiguousSuccessfulSignerBeforeQueue, true);
  assert.throws(() => assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(result), /without a unique exact pull-request association/);
});

test('unassociated protected-base run without a successful pre-queue signer does not block ordinary route', async () => {
  const protectedTrigger = run({ head_sha: bBaseSha, pull_requests: [] });
  const result = await inspect({ runs: [protectedTrigger], jobs: [{ jobs: [] }] });
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
  assert.equal(result.hasAmbiguousSuccessfulSignerBeforeQueue, false);
  assert.doesNotThrow(() => assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(result));
});

test('known unrelated association and unrelated workflow shape do not create ambiguity', async () => {
  const otherAssociation = run({ head_sha: bBaseSha, pull_requests: [{ number: 234,
    base: { ref: 'main', sha: 'd'.repeat(40), repo: { full_name: repository } },
    head: { sha: bHeadSha, repo: { full_name: repository } } }] });
  const wrongWorkflow = run({ id: 124, head_sha: bBaseSha, path: '.github/workflows/other.yml', pull_requests: [] });
  const result = await inspect({ runs: [otherAssociation, wrongWorkflow], jobs: [] });
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasAmbiguousSuccessfulSignerBeforeQueue, false);
  assert.doesNotThrow(() => assertMissingOwnerAmendmentTagHasNoSuccessfulSigner(result));
});

test('candidate identity comes from the exact pull-request base/head association, not workflow head_sha', async () => {
  const protectedTrigger = run({ head_sha: bBaseSha });
  const result = await inspect({ runs: [protectedTrigger], jobs: [{ jobs: [signer({ head_sha: bBaseSha })] }] });
  assert.equal(result.latestSignerAttempt.run.head_sha, bBaseSha);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
});

test('wrong base or candidate pull-request association is not an exact-B producer attempt', async () => {
  const staleBase = run({ pull_requests: [{ number: 123,
    base: { ref: 'main', sha: 'd'.repeat(40), repo: { full_name: repository } },
    head: { sha: bHeadSha, repo: { full_name: repository } } }] });
  const wrongHead = run({ id: 124, pull_requests: [{ number: 123,
    base: { ref: 'main', sha: bBaseSha, repo: { full_name: repository } },
    head: { sha: 'e'.repeat(40), repo: { full_name: repository } } }] });
  const result = await inspect({ runs: [staleBase, wrongHead], jobs: [] });
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
});

test('a successful signer that completed at or after queue entry cannot authorize the pre-transition artifact', async () => {
  const result = await inspect({ jobs: [{ jobs: [signer({ completed_at: queueEnteredAt })] }] });
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
});

test('only protected self pull_request_target exact-B workflow attempts are considered', async () => {
  const untrusted = run({ head_repository: { full_name: 'attacker/fork' } });
  const wrongWorkflow = run({ id: 124, path: '.github/workflows/other.yml@refs/heads/main' });
  const result = await inspect({ runs: [untrusted, wrongWorkflow], jobs: [] });
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
});

test('malformed protected run/job listing fails closed rather than being treated as ordinary', async () => {
  await assert.rejects(inspect({ runs: [{ ...run(), id: 'bad' }] }), /invalid or duplicate run ID/);
  await assert.rejects(inspect({ jobs: [null] }), /job listing is malformed or oversized/);
  await assert.rejects(inspect({ jobs: [{ jobs: [signer({ completed_at: 'invalid' })] }] }), /completion time is invalid/);
});

test('accepts actual API jobs without run_attempt but rejects a mismatched present value', async t => {
  await t.test('missing optional run_attempt is bound by the requested attempt endpoint', async () => {
    const result = await inspect({ jobs: [{ jobs: [signer()] }] });
    assert.equal(result.latestSignerAttempt.runAttempt, '1');
    assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
  });
  await t.test('present run_attempt must agree with requested attempt', async () => {
    const rerun = run({ status: 'in_progress', run_attempt: 2 });
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [rerun] }),
      listJobs: async ({ runAttempt }) => ({ total_count: 1, jobs: [identifiedJob(signer(), 930,
        { runAttempt: runAttempt === '1' ? 2 : 1 })] }),
    }), /mismatched job identity/);
  });
});

test('completed skipped signer with null timestamps is treated as no execution and preserves earlier success', async () => {
  const rerun = run({ run_attempt: 2, status: 'in_progress' });
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
    listRuns: async () => ({ total_count: 1, workflow_runs: [rerun] }),
    listJobs: async ({ runAttempt }) => runAttempt === '2'
      ? ({ total_count: 1, jobs: [identifiedJob(signer({ status: 'completed', conclusion: 'skipped',
        started_at: null, completed_at: null }), 932, { runAttempt: 2 })] })
      : ({ total_count: 1, jobs: [identifiedJob(signer(), 931, { runAttempt: 1 })] }),
  });
  assert.equal(result.attempts.length, 1);
  assert.equal(result.latestSignerAttempt.runAttempt, '1');
  assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
});

test('paginates exact-B workflow runs and finds a successful signer omitted from the first 100', async () => {
  const runs = Array.from({ length: 101 }, (_, index) => run({ id: index + 1,
    created_at: new Date(Date.UTC(2026, 8, 30, 11, 0, 0) - index * 1_000).toISOString() }));
  const pages = [];
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
    listRuns: async ({ page, perPage }) => {
      pages.push(page);
      return { total_count: runs.length, workflow_runs: runs.slice((page - 1) * perPage, page * perPage) };
    },
    listJobs: async ({ runId }) => ({ total_count: runId === 1 ? 1 : 0,
      jobs: runId === 1 ? [identifiedJob(signer(), 9_001, { runId })] : [] }),
  });
  assert.deepEqual(pages, [1, 2]);
  assert.equal(result.latestSignerAttempt.run.id, 1);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
});

test('rejects truncated, drifting, duplicate, or over-limit workflow run pagination', async t => {
  const fullPage = Array.from({ length: 100 }, (_, index) => run({ id: index + 1 }));
  await t.test('missing later page', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async ({ page }) => ({ total_count: 101, workflow_runs: page === 1 ? fullPage : [] }),
      listJobs: async () => ({ jobs: [] }) }),
    /truncated or inconsistent/);
  });
  await t.test('total count changed between pages', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async ({ page }) => page === 1
        ? { total_count: 101, workflow_runs: fullPage }
        : { total_count: 102, workflow_runs: [run({ id: 101 })] },
      listJobs: async () => ({ jobs: [] }) }), /count changed during pagination/);
  });
  await t.test('duplicate run across pages', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async ({ page }) => page === 1
        ? { total_count: 101, workflow_runs: fullPage }
        : { total_count: 101, workflow_runs: [fullPage[0]] },
      listJobs: async () => ({ jobs: [] }) }), /duplicate run ID/);
  });
  await t.test('pagination limit', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async ({ page, perPage }) => ({ total_count: 1_001,
        workflow_runs: Array.from({ length: perPage }, (_, index) => run({ id: (page - 1) * perPage + index + 1 })) }),
      listJobs: async () => ({ jobs: [] }) }), /1,000-result completeness limit/);
  });
});

test('bounds workflow run search to protected base SHA and exact PR-created-through-queue window', async () => {
  let query;
  await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha,
    bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
    listRuns: async parameters => {
      query = parameters;
      return { total_count: 0, workflow_runs: [] };
    },
    listJobs: async () => ({ total_count: 0, jobs: [] }),
  });
  assert.deepEqual(query, { repository, bBaseSha, createdFrom: pullRequestCreatedAt,
    createdTo: queueEnteredAt, page: 1, perPage: 100 });
});

test('does not inspect runs outside the PR-to-queue window or from a different protected head SHA', async () => {
  const beforePr = run({ id: 124, created_at: '2026-09-30T09:59:59Z' });
  const afterQueue = run({ id: 125, created_at: '2026-09-30T12:00:01Z' });
  const otherProtectedHead = run({ id: 126, head_sha: 'c'.repeat(40) });
  let jobLookups = 0;
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha,
    bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
    listRuns: async () => ({ total_count: 3, workflow_runs: [beforePr, afterQueue, otherProtectedHead] }),
    listJobs: async () => { jobLookups += 1; return { total_count: 0, jobs: [] }; },
  });
  assert.equal(jobLookups, 0);
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasAmbiguousSuccessfulSignerBeforeQueue, false);
});

test('detects a prior successful signer hidden by a later in-progress rerun attempt', async () => {
  const rerun = run({ status: 'in_progress', run_attempt: 2 });
  const queriedAttempts = [];
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
    listRuns: async () => ({ total_count: 1, workflow_runs: [rerun] }),
    listJobs: async ({ runAttempt }) => {
      queriedAttempts.push(runAttempt);
      return { total_count: runAttempt === '1' ? 1 : 0,
        jobs: runAttempt === '1' ? [identifiedJob(signer(), 901)] : [] };
    },
  });
  assert.deepEqual(queriedAttempts, ['2', '1']);
  assert.equal(result.latestSignerAttempt.runAttempt, '1');
  assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
});

test('selects latest signer by actual start time across runs, including an older run rerun later', async () => {
  const older = run({ id: 10, run_attempt: 2, created_at: '2026-09-30T10:00:00Z' });
  const newer = run({ id: 20, run_attempt: 1, created_at: '2026-09-30T11:00:00Z' });
  const queried = [];
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
    listRuns: async () => ({ total_count: 2, workflow_runs: [newer, older] }),
    listJobs: async ({ runId, runAttempt }) => {
      queried.push(`${runId}/${runAttempt}`);
      if (runId === 20) return { total_count: 1, jobs: [identifiedJob(signer(), 920, { runId, runAttempt: 1 })] };
      if (runAttempt === '2') return { total_count: 1, jobs: [identifiedJob(signer({
        status: 'in_progress', conclusion: null, started_at: '2026-09-30T11:45:00Z', completed_at: null,
      }), 912, { runId, runAttempt: 2 })] };
      return { total_count: 1, jobs: [identifiedJob(signer({ started_at: '2026-09-30T10:15:00Z',
        completed_at: '2026-09-30T10:30:00Z' }), 911, { runId, runAttempt: 1 })] };
    },
  });
  assert.deepEqual(queried, ['20/1', '10/2', '10/1']);
  assert.equal(result.latestSignerAttempt.run.id, 10);
  assert.equal(result.latestSignerAttempt.runAttempt, '2');
  assert.equal(result.latestSignerAttempt.job.status, 'in_progress');
  assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
});

test('paginates signer jobs and fails closed on incomplete or unstable job listings', async t => {
  const fillers = Array.from({ length: 100 }, (_, index) => ({ id: 1_000 + index,
    name: `unrelated-${index}`, status: 'completed', conclusion: 'success', started_at: '2026-09-30T10:00:00Z',
    completed_at: '2026-09-30T10:01:00Z' }));
  await t.test('finds signer on the second page', async () => {
    const pages = [];
    const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [run()] }),
      listJobs: async ({ page }) => {
        pages.push(page);
        return { total_count: 101, jobs: page === 1 ? fillers.map((job, index) => identifiedJob(job, job.id))
          : [identifiedJob(signer(), 9_999)] };
      },
    });
    assert.deepEqual(pages, [1, 2]);
    assert.equal(result.latestSignerAttempt.job.id, 9_999);
    assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
  });
  await t.test('rejects truncated job pagination', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [run()] }),
      listJobs: async ({ page }) => ({ total_count: 101,
        jobs: page === 1 ? fillers.map((job, index) => identifiedJob(job, job.id)) : [] }),
    }), /truncated or inconsistent/);
  });
  await t.test('rejects job total-count drift and duplicate identities', async () => {
    let calls = 0;
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [run()] }),
      listJobs: async ({ page }) => ({ total_count: page === 1 ? 101 : 102,
        jobs: page === 1 ? fillers.map(job => identifiedJob(job, job.id)) : [identifiedJob(signer(), 9_999)] }),
    }), /count changed during pagination/);
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [run()] }),
      listJobs: async ({ page }) => {
        calls++;
        return { total_count: 101, jobs: page === 1 ? fillers.map(job => identifiedJob(job, job.id))
          : [identifiedJob(signer(), fillers[0].id)] };
      },
    }), /invalid, duplicate, or mismatched job identity/);
    assert.equal(calls, 2);
  });
  await t.test('rejects listings exceeding the page bound', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bBaseSha, bHeadSha, bPullRequestCreatedAt: pullRequestCreatedAt, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [run()] }),
      listJobs: async ({ page, perPage }) => ({ total_count: 1_001,
        jobs: Array.from({ length: perPage }, (_, index) => ({ ...identifiedJob({ name: `job-${index}` },
          (page - 1) * perPage + index + 1) })) }),
    }), /bounded pagination limit/);
  });
});

test('validates signer timestamps and selects a later non-success attempt for eligibility fail-closed', async () => {
  const result = await inspect({ jobs: [{ jobs: [signer({ started_at: '2026-09-30T12:05:00Z',
    status: 'in_progress', conclusion: null, completed_at: null })] }] });
  assert.equal(result.latestSignerAttempt.job.status, 'in_progress');
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
  await assert.rejects(inspect({ jobs: [{ jobs: [signer({ started_at: 'bad' })] }] }), /start time is invalid/);
  await assert.rejects(inspect({ jobs: [{ jobs: [signer({ completed_at: '2026-09-30T11:00:00Z' })] }] }), /completes before it starts/);
});
