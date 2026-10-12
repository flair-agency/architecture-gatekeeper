import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { runCodexReviewer } from '../dist/codex-transport.mjs';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

test('Codex rejects invalid timeouts before creating files or spawning the CLI', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-timeout-contract-'));
  const temporaryRoot = join(root, 'tmp');
  const binaryDirectory = join(root, 'bin');
  const marker = join(root, 'spawned');
  mkdirSync(temporaryRoot);
  mkdirSync(binaryDirectory);
  const executable = join(binaryDirectory, 'codex');
  writeFileSync(executable, `#!/bin/sh\nprintf called > "$CODEX_FAKE_MARKER"\n`, { mode: 0o700 });
  chmodSync(executable, 0o700);
  const previous = {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    CODEX_FAKE_MARKER: process.env.CODEX_FAKE_MARKER,
  };

  try {
    process.env.PATH = `${binaryDirectory}:${dirname(process.execPath)}`;
    process.env.TMPDIR = temporaryRoot;
    process.env.CODEX_FAKE_MARKER = marker;

    const invalidTimeouts = [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, 3_600_001, undefined];
    for (const reviewTimeoutMs of invalidTimeouts) {
      const request = {
        repositoryRoot: projectRoot,
        prompt: 'Review this change.',
        schema: { type: 'object' },
        reviewer: { model: 'codex-model', reasoningEffort: 'low', reviewTimeoutMs },
      };
      assert.throws(
        () => runCodexReviewer(request),
        { message: 'Codex reviewer timeout must be an integer between 1000 and 3600000 milliseconds.' },
      );
    }

    assert.deepEqual(readdirSync(temporaryRoot), []);
    assert.equal(readdirSync(root).includes('spawned'), false);
  } finally {
    if (previous.PATH === undefined) delete process.env.PATH;
    else process.env.PATH = previous.PATH;
    if (previous.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous.TMPDIR;
    if (previous.CODEX_FAKE_MARKER === undefined) delete process.env.CODEX_FAKE_MARKER;
    else process.env.CODEX_FAKE_MARKER = previous.CODEX_FAKE_MARKER;
    rmSync(root, { recursive: true, force: true });
  }
});

test('Codex passes the single validated timeout read to spawnSync', () => {
  const root = mkdtempSync(join(tmpdir(), 'codex-timeout-getter-'));
  const temporaryRoot = join(root, 'tmp');
  const binaryDirectory = join(root, 'bin');
  mkdirSync(temporaryRoot);
  mkdirSync(binaryDirectory);
  const executable = join(binaryDirectory, 'codex');
  const payload = join(root, 'fake-codex.mjs');
  writeFileSync(payload, `import { writeFileSync } from 'node:fs';\nimport { setTimeout } from 'node:timers/promises';\nconst args = process.argv.slice(2);\nconst output = args[args.indexOf('--output-last-message') + 1];\nawait setTimeout(2000);\nwriteFileSync(output, '{"ok":true}');\n`);
  writeFileSync(executable, `#!/bin/sh\nexec "${process.execPath}" "${payload}" "$@"\n`, { mode: 0o700 });
  chmodSync(executable, 0o700);
  const previous = {
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
  };

  try {
    process.env.PATH = `${binaryDirectory}:${dirname(process.execPath)}`;
    process.env.TMPDIR = temporaryRoot;
    let timeoutReads = 0;
    const reviewer = {
      model: 'codex-model',
      reasoningEffort: 'low',
      get reviewTimeoutMs() {
        timeoutReads += 1;
        return timeoutReads === 1 ? 1000 : 0;
      },
    };

    const startedAt = performance.now();
    assert.throws(
      () => runCodexReviewer({
        repositoryRoot: projectRoot,
        prompt: 'Review this change.',
        schema: { type: 'object' },
        reviewer,
      }),
      { message: 'Architecture gate reviewer failed or returned invalid output.' },
    );
    assert.ok(performance.now() - startedAt < 1900, 'the validated 1000 ms deadline must stop the two-second CLI');
    assert.equal(timeoutReads, 1);
    assert.equal(readdirSync(temporaryRoot).length, 0);
  } finally {
    if (previous.PATH === undefined) delete process.env.PATH;
    else process.env.PATH = previous.PATH;
    if (previous.TMPDIR === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = previous.TMPDIR;
    rmSync(root, { recursive: true, force: true });
  }
});
