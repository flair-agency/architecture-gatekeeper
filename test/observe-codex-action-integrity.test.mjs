import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { observeCandidateIdentity } from '../src/observe-codex-action-integrity.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const bytes = (path) => readFileSync(resolve(root, path));
const baseline = {
  workflow: bytes('.github/workflows/architecture-gate.yml').toString(),
  manifest: JSON.parse(bytes('provenance/codex-action-v1.12-pr151.json')),
  record: JSON.parse(bytes('provenance/fixtures/codex-action-integrity-candidate-v1.json')),
  procedure: JSON.parse(bytes('provenance/codex-action-integrity-procedure-v1.json')),
  procedureBytes: bytes('provenance/codex-action-integrity-procedure-v1.json'),
  verifierBytes: bytes('src/verify-codex-action.mjs'),
};

function candidate(change) {
  const args = {
    ...baseline,
    manifest: structuredClone(baseline.manifest),
    record: structuredClone(baseline.record),
    procedure: structuredClone(baseline.procedure),
  };
  change(args);
  return () => observeCandidateIdentity(args);
}

test('matching identity remains explicitly unauthoritative', () => {
  assert.deepEqual(observeCandidateIdentity(baseline), {
    identityMatches: true,
    authorization: false,
    reason: 'unpromoted-fixture',
  });
});

test('changed Action repository with the same SHA does not match checkout', () => {
  assert.throws(candidate((args) => {
    args.workflow = args.workflow.replace('uses: flair-agency/codex-action@', 'uses: openai/codex-action@');
  }), /Review Action and integrity checkout differ/);
});

test('changed Action SHA, checkout SHA, tree, entrypoint, or executable digest is rejected', () => {
  const cases = [
    (args) => { args.workflow = args.workflow.replace('codex-action@f93255', 'codex-action@a93255'); },
    (args) => { args.workflow = args.workflow.replace('ref: f93255', 'ref: a93255'); },
    (args) => { args.record.action.tree = `b${args.record.action.tree.slice(1)}`; },
    (args) => { args.record.action.entrypoint = 'dist/other.js'; },
    (args) => { args.record.action.entrypointSha256 = `a${args.record.action.entrypointSha256.slice(1)}`; },
  ];
  for (const change of cases) assert.throws(candidate(change));
});

test('expressions, tags, duplicate review Action, and duplicate uses are rejected', () => {
  const cases = [
    (args) => { args.workflow = args.workflow.replace('uses: flair-agency/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537', 'uses: flair-agency/codex-action@${{ github.sha }}'); },
    (args) => { args.workflow = args.workflow.replace('uses: flair-agency/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537', 'uses: flair-agency/codex-action@v1'); },
    (args) => { args.workflow = args.workflow.replace('      - name: Run read-only architecture review', '      - name: Run read-only architecture review\n      - name: Run read-only architecture review'); },
    (args) => { args.workflow = args.workflow.replace('uses: flair-agency/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537', 'uses: flair-agency/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537\n        uses: flair-agency/codex-action@f93255fd2e5a17a0b4bd557599535e80c8607537'); },
  ];
  for (const change of cases) assert.throws(candidate(change));
});

test('procedure verifier, commands, and toolchain drift are rejected', () => {
  assert.throws(candidate((args) => { args.verifierBytes = Buffer.from('different verifier'); }), /Full verifier bytes differ/);
  assert.throws(candidate((args) => { args.workflow = args.workflow.replace('pnpm test', 'pnpm test --different'); }), /Full verification commands drifted/);
  assert.throws(candidate((args) => { args.workflow = args.workflow.replace('version: 10.33.0', 'version: 10.33.1'); }), /Full verification toolchain drifted/);
  assert.throws(candidate((args) => { args.record.procedure.sha256 = 'a'.repeat(64); }), /Procedure identity differs/);
});

test('missing evidence and a forged promotion claim cannot become authority', () => {
  assert.throws(candidate((args) => { args.record = null; }), /Candidate record must be an object/);
  assert.throws(candidate((args) => { args.record.state = 'promoted'; args.record.verification.result = 'passed'; }), /Only an unpromoted/);
  assert.throws(candidate((args) => { args.record.cacheHit = true; }), /unsupported fields/);
});

test('a disabled full-verification step can still match text but never grants authorization', () => {
  const observe = candidate((args) => {
    args.workflow = args.workflow.replace(
      '      - name: Verify the pinned action before exposing review credentials\n        run: |',
      '      - name: Verify the pinned action before exposing review credentials\n        if: false\n        run: |',
    );
  });
  assert.deepEqual(observe(), {
    identityMatches: true,
    authorization: false,
    reason: 'unpromoted-fixture',
  });
});

test('observation job is outside the enforced review and acceptance dependencies', () => {
  assert.match(baseline.workflow, /  codex-action-integrity-observe:\n(?:.|\n)*?    continue-on-error: true/);
  assert.match(baseline.workflow, /  review:\n    if: needs\.policy\.outputs\.mode == 'enforced'\n    needs: \[policy, codex-action-integrity\]/);
  assert.doesNotMatch(baseline.workflow, /needs:.*codex-action-integrity-observe/);
});
