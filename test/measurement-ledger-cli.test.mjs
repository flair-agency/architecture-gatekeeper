import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function dataset() {
  return { version: 1, records: [{ version: 1, kind: 'agk-diagnostic', attemptId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', phase: 'terminal',
    route: 'manual', startedAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-01T00:00:01Z', state: 'completed', changeId: 'change',
    decision: 'BLOCK', findingCount: 1 }], population: [{ changeId: 'change', eligible: true, cohort: 'natural', domain: 'self' }],
    cases: [{ caseId: 'violation', changeId: 'change', kind: 'architecture-violation', adjudication: 'valid', disposition: 'integrated-violation',
      findingRefs: [{ attemptId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', index: 0 }], evidence: ['assessor'], adjudicator: 'assessor',
      initialRef: 'initial', finalRef: 'final', authorityRef: 'authority' }],
    audits: [{ changeId: 'change', blinded: true, auditor: 'auditor', initialRef: 'initial', finalRef: 'final', authorityRef: 'authority',
      evidence: ['audit'], initialViolationCaseIds: ['violation'], finalViolationCaseIds: ['violation'] }] };
}

test('real aggregate and sample CLIs reject inconsistent ledgers without emitting partial output', t => {
  const parent = mkdtempSync(join(realpathSync(tmpdir()), 'agk-ledger-cli-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const path = join(parent, 'dataset.json');
  const mutations = [
    [d => { d.cases[0].disposition = 'corrected'; }, /final audit disposition/],
    [d => { d.audits[0].finalViolationCaseIds = []; }, /final audit omits integrated violation/],
    [d => { d.records[0].route = 'ci-outcome'; }, /finding reference/],
    [d => { d.population[0].initialRef = { decision: 'BLOCK' }; }, /population reference/],
    [d => { d.population[0].finalRef = ['BLOCK']; }, /population reference/],
    [d => { d.cases[0].evidence = ['valid', null]; }, /case evidence/],
    [d => { d.audits[0].evidence = ['valid', {}]; }, /audit evidence/],
    [d => { d.cases[0].adjudicator = ' '; }, /assessor/],
    [d => { d.audits[0].auditor = '\t'; }, /audit evidence/],
    ...['0', -1, 0.5, Number.MAX_SAFE_INTEGER + 1, {}, [], true].map(value => [d => { d.collectionGaps = value; }, /collection gap count/]),
  ];
  for (const command of [['aggregate'], ['sample', 'seed', '1']]) {
    writeFileSync(path, JSON.stringify(dataset()));
    let run = spawnSync(process.execPath, [new URL('../dist/measurement-cli.mjs', import.meta.url).pathname, command[0], path, ...command.slice(1)], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr); assert.equal(JSON.parse(run.stdout).version, 1);
    for (const [mutate, error] of mutations) {
      const invalid = dataset(); mutate(invalid); writeFileSync(path, JSON.stringify(invalid));
      run = spawnSync(process.execPath, [new URL('../dist/measurement-cli.mjs', import.meta.url).pathname, command[0], path, ...command.slice(1)], { encoding: 'utf8' });
      assert.equal(run.status, 2); assert.equal(run.stdout, ''); assert.match(run.stderr, error);
    }
  }
});


test('real analysis CLI rejects unsupported commands without partial output', t => {
  const root = mkdtempSync(join(realpathSync(tmpdir()), 'agk-invalid-cli-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const invalid = spawnSync(process.execPath, [new URL('../dist/measurement-cli.mjs', import.meta.url).pathname, 'unexpected'], { encoding: 'utf8' });
  assert.equal(invalid.status, 2); assert.equal(invalid.stdout, ''); assert.match(invalid.stderr, /Usage:/);
});


test('actual service-account environments with missing HOME and TMPDIR retain capture/export/analysis through valid roots', { skip: process.platform === 'win32' }, t => {
  const parent = mkdtempSync(join(realpathSync('/tmp'), 'agk-service-roots-')); t.after(() => rmSync(parent, { recursive: true, force: true }));
  const root = join(parent, 'work'); const records = join(parent, 'records'); mkdirSync(root); mkdirSync(records, { mode: 0o700 });
  const env = { ...process.env, HOME: join(parent, 'missing-home'), TMPDIR: join(parent, 'missing-tmp'), TEMP: join(parent, 'missing-tmp'), TMP: join(parent, 'missing-tmp') };
  const script = `
    import assert from 'node:assert/strict';
    import { beginMeasurement } from ${JSON.stringify(new URL('../dist/measurement.mjs', import.meta.url).href)};
    const capture = beginMeasurement({route:'manual', cwd:process.cwd(), directory:process.argv[1], changeId:'fixture'});
    assert.ok(capture.id); capture.request({requestId:'a'.repeat(64),prompt:'fixture',schema:{}},{kind:'proposed-task'});
    capture.finish({decision:{decision:'PASS', findings:[]}});
  `;
  let result = spawnSync(process.execPath, ['--input-type=module', '-e', script, records], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const cli = new URL('../dist/measurement-cli.mjs', import.meta.url).pathname;
  result = spawnSync(process.execPath, [cli, 'export', records], { cwd: root, env, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr); const exported = JSON.parse(result.stdout); assert.equal(exported.records.length, 3);
  const data = { version: 1, records: exported.records, population: [], cases: [], audits: [] };
  // Exercise both a working-root file and a conventional-temp-root file.
  for (const directory of [root, parent]) {
    const path = join(directory, 'dataset.json'); writeFileSync(path, JSON.stringify(data));
    for (const args of [['aggregate', path], ['sample', path, 'seed', '1']]) {
      result = spawnSync(process.execPath, [cli, ...args], { cwd: root, env, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr); assert.equal(JSON.parse(result.stdout).version, 1);
    }
  }
});
