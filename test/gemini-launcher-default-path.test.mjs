import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

for (const layout of ['src', 'dist']) test(`${layout} default launcher starts the actual flat runner and reaches its missing-prompt validation`, () => {
  const launcher = new URL(`../${layout}/gemini-launcher.mjs`, import.meta.url).href;
  const intended = fileURLToPath(new URL(`../${layout}/gemini-ci-runner.mjs`, import.meta.url));
  const code = `
    import childProcess from 'node:child_process';
    import { syncBuiltinESMExports } from 'node:module';
    const actualSpawn = childProcess.spawn;
    childProcess.spawn = (...args) => {
      process.stderr.write('ACTUAL_RUNNER=' + JSON.stringify(args[1][0]) + '\\n');
      return actualSpawn(...args);
    };
    syncBuiltinESMExports();
    const { runIsolatedGeminiSession } = await import(${JSON.stringify(launcher)});
    process.exitCode = await runIsolatedGeminiSession(['--model', 'gemini-2.5-flash'], {
      credentialsOptions: { apiKey: 'synthetic-default-path-secret' }, timeoutMs: 5000
    });
  `;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    encoding: 'utf8', timeout: 10000, env: { PATH: process.env.PATH, TMPDIR: process.env.TMPDIR }
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 2, result.stderr);
  assert.match(result.stderr, /Missing prompt file path/);
  assert.doesNotMatch(result.stderr, /MODULE_NOT_FOUND|Cannot find module|ERR_MODULE_NOT_FOUND/);
  const observed = result.stderr.split('\n').find(line => line.startsWith('ACTUAL_RUNNER='));
  assert.equal(JSON.parse(observed.slice('ACTUAL_RUNNER='.length)), intended);
});
