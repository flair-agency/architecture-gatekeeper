import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectOwnerAmendmentSemanticProducerAttempts } from '../src/owner-amendment-semantic-producer-attempts.mjs';

const repository = 'flair-agency/architecture-gatekeeper';
const bHeadSha = 'a'.repeat(40);
const queueEnteredAt = '2026-09-30T12:00:00Z';
const run = (changes = {}) => ({ id: 123, run_attempt: 1, created_at: '2026-09-30T11:00:00Z',
  repository: { full_name: repository }, head_repository: { full_name: repository },
  event: 'pull_request_target', head_sha: bHeadSha,
  path: '.github/workflows/self-architecture-gate.yml@refs/heads/main', status: 'completed', ...changes });
const signer = (changes = {}) => ({ id: 900, name: 'owner-amendment-semantic-eligibility-signer',
  status: 'completed', conclusion: 'success', started_at: '2026-09-30T11:15:00Z',
  completed_at: '2026-09-30T11:30:00Z', ...changes });

async function inspect({ runs = [run()], jobs = [{ jobs: [] }], queueAt = queueEnteredAt } = {}) {
  let jobsIndex = 0;
  return inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt: queueAt,
    listRuns: async ({ page, perPage }) => ({ total_count: runs.length,
      workflow_runs: runs.slice((page - 1) * perPage, page * perPage) }),
    listJobs: async ({ runId, runAttempt, page, perPage }) => {
      const response = jobsIndex < jobs.length ? jobs[jobsIndex++] : { jobs: [] };
      if (response === null) return response;
      const identified = response.jobs.map((job, index) => job === null ? null : ({ ...job,
        id: job.id ?? 900 + index, run_id: job.run_id ?? runId,
        head_sha: job.head_sha ?? bHeadSha }));
      return { total_count: response.total_count ?? identified.length,
        jobs: response.pageJobs ?? identified.slice((page - 1) * perPage, page * perPage) };
    } });
}

const identifiedJob = (job, id, { runId = 123, runAttempt, includeRunAttempt = runAttempt !== undefined } = {}) => ({ ...job, id,
  run_id: runId, ...(includeRunAttempt ? { run_attempt: runAttempt } : {}), head_sha: bHeadSha });

test('ordinary exact-B run without a successful semantic signer remains eligible for NOT_APPLICABLE', async () => {
  const result = await inspect();
  assert.equal(result.latestSignerAttempt, null);
  assert.equal(result.hasSuccessfulSignerBeforeQueue, false);
});

test('successful exact-B semantic signer completed before queue entry makes a missing tag fail closed', async () => {
  const result = await inspect({ jobs: [{ jobs: [signer()] }] });
  assert.equal(result.latestSignerAttempt.job.name, 'owner-amendment-semantic-eligibility-signer');
  assert.equal(result.hasSuccessfulSignerBeforeQueue, true);
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
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [rerun] }),
      listJobs: async ({ runAttempt }) => ({ total_count: 1, jobs: [identifiedJob(signer(), 930,
        { runAttempt: runAttempt === '1' ? 2 : 1 })] }),
    }), /mismatched job identity/);
  });
});

test('completed skipped signer with null timestamps is treated as no execution and preserves earlier success', async () => {
  const rerun = run({ run_attempt: 2, status: 'in_progress' });
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
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
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
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
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
      listRuns: async ({ page }) => ({ total_count: 101, workflow_runs: page === 1 ? fullPage : [] }),
      listJobs: async () => ({ jobs: [] }) }),
    /truncated or inconsistent/);
  });
  await t.test('total count changed between pages', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
      listRuns: async ({ page }) => page === 1
        ? { total_count: 101, workflow_runs: fullPage }
        : { total_count: 102, workflow_runs: [run({ id: 101 })] },
      listJobs: async () => ({ jobs: [] }) }), /count changed during pagination/);
  });
  await t.test('duplicate run across pages', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
      listRuns: async ({ page }) => page === 1
        ? { total_count: 101, workflow_runs: fullPage }
        : { total_count: 101, workflow_runs: [fullPage[0]] },
      listJobs: async () => ({ jobs: [] }) }), /duplicate run ID/);
  });
  await t.test('pagination limit', async () => {
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
      listRuns: async ({ page, perPage }) => ({ total_count: 1_001,
        workflow_runs: Array.from({ length: perPage }, (_, index) => run({ id: (page - 1) * perPage + index + 1 })) }),
      listJobs: async () => ({ jobs: [] }) }), /bounded pagination limit/);
  });
});

test('detects a prior successful signer hidden by a later in-progress rerun attempt', async () => {
  const rerun = run({ status: 'in_progress', run_attempt: 2 });
  const queriedAttempts = [];
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
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
  const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
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
    const result = await inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
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
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [run()] }),
      listJobs: async ({ page }) => ({ total_count: 101,
        jobs: page === 1 ? fillers.map((job, index) => identifiedJob(job, job.id)) : [] }),
    }), /truncated or inconsistent/);
  });
  await t.test('rejects job total-count drift and duplicate identities', async () => {
    let calls = 0;
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
      listRuns: async () => ({ total_count: 1, workflow_runs: [run()] }),
      listJobs: async ({ page }) => ({ total_count: page === 1 ? 101 : 102,
        jobs: page === 1 ? fillers.map(job => identifiedJob(job, job.id)) : [identifiedJob(signer(), 9_999)] }),
    }), /count changed during pagination/);
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
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
    await assert.rejects(inspectOwnerAmendmentSemanticProducerAttempts({ repository, bHeadSha, queueEnteredAt,
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
