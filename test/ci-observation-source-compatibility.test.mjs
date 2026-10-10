import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('source and emitted observer entrypoints retain stdin, argument and import behavior', () => {
  const envelope = {
    expectedExecution: { provider: 'codex', requestedModel: 'gpt-6.1-sol', requestedSettings: {} },
    hostStepOutcome: 'success', rawResponse: 'opaque non-JSON response', maxResponseBytes: 65_536,
  };
  for (const directory of ['src', 'dist']) {
    const url = new URL(`../${directory}/ci-execution-observation.mjs`, import.meta.url);
    const cli = fileURLToPath(url);
    const run = (args, input) => spawnSync(process.execPath, [cli, ...args], {
      input, encoding: 'utf8', timeout: 5_000,
    });
    const completed = run([], JSON.stringify(envelope));
    assert.equal(completed.status, 0, completed.stderr);
    assert.equal(completed.stdout, 'status=completed\n');
    const incomplete = run([], JSON.stringify({ ...envelope, hostStepOutcome: 'failure' }));
    assert.equal(incomplete.status, 1);
    assert.equal(incomplete.stdout, 'status=incomplete\n');
    for (const [args, input] of [[[], '{'], [['--invalid'], undefined]]) {
      const invalid = run(args, input);
      assert.equal(invalid.status, 1);
      assert.equal(invalid.stdout, '');
      assert.equal(invalid.stderr, 'Invalid CI execution observation input.\n');
    }
    const imported = spawnSync(process.execPath, ['--input-type=module', '-e',
      `const mod = await import(${JSON.stringify(url.href)}); process.stdout.write(JSON.stringify(Object.keys(mod)));`], {
      encoding: 'utf8', timeout: 5_000,
    });
    assert.equal(imported.status, 0, imported.stderr);
    assert.equal(imported.stderr, '');
    assert.deepEqual(JSON.parse(imported.stdout), ['runCiExecutionObservationCli', 'runCiExecutionObservationGitHubCli']);
  }
});
