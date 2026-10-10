import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';
import { ordinaryDecisionKind } from '../dist/ci-decision-kind.mjs';
import { ordinaryDecisionKind as sourceOrdinaryDecisionKind } from '../src/ci-decision-kind.mjs';

test('routes only a bounded completed ordinary decision kind', () => {
  for (const kind of ['PASS', 'BLOCK', 'OWNER_DECISION']) {
    assert.equal(ordinaryDecisionKind(JSON.stringify({ decision: kind, summary: 'fixture' })), kind);
  }
  for (const raw of ['', '{', '[]', '{}', '{"decision":"OWNER_ADDITION_G0"}', 'x'.repeat(65_537)]) {
    assert.throws(() => ordinaryDecisionKind(raw));
  }
});

test('keeps the legacy flat export and its actual repeated property read unknown', () => {
  assert.equal(typeof sourceOrdinaryDecisionKind, 'function');
  const previous = Object.getOwnPropertyDescriptor(Object.prototype, 'decision');
  let reads = 0;
  try {
    Object.defineProperty(Object.prototype, 'decision', {
      configurable: true,
      get() { reads += 1; return reads === 1 ? 'PASS' : 'SECOND_READ'; },
    });
    assert.equal(ordinaryDecisionKind('{}'), 'SECOND_READ');
    assert.equal(reads, 2);
  } finally {
    if (previous) Object.defineProperty(Object.prototype, 'decision', previous);
    else delete Object.prototype.decision;
  }
});

test('flat facade import is inert and source/emitted direct paths append the same output', () => {
  const directory = mkdtempSync(join(tmpdir(), 'ci-decision-kind-'));
  try {
    const output = join(directory, 'output');
    writeFileSync(output, 'existing=true\n');
    const modulePath = new URL('../dist/ci-decision-kind.mjs', import.meta.url).pathname;
    const scripts = [
      new URL('../src/ci-decision-kind.mjs', import.meta.url).pathname,
      modulePath,
    ];
    for (const script of scripts) {
      const importResult = spawnSync(process.execPath, ['--input-type=module', '-e',
        `const mod = await import(${JSON.stringify(pathToFileURL(script).href)}); process.stdout.write(Object.keys(mod).join(','));`], {
        encoding: 'utf8', env: { ...process.env, DECISION: '{"decision":"PASS"}', GITHUB_OUTPUT: output },
      });
      assert.equal(importResult.status, 0, importResult.stderr);
      assert.equal(importResult.stdout, 'ordinaryDecisionKind');
      assert.equal(readFileSync(output, 'utf8'), 'existing=true\n');

      const result = spawnSync(process.execPath, [script], {
        encoding: 'utf8', env: { ...process.env, DECISION: '{"decision":"BLOCK"}', GITHUB_OUTPUT: output },
      });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(readFileSync(output, 'utf8'), 'existing=true\nkind=BLOCK\n');
      writeFileSync(output, 'existing=true\n');

      const malformed = spawnSync(process.execPath, [script], {
        encoding: 'utf8', env: { ...process.env, DECISION: '{', GITHUB_OUTPUT: output },
      });
      assert.notEqual(malformed.status, 0);
      assert.match(malformed.stderr, /Ordinary decision is not JSON\./);
      assert.equal(readFileSync(output, 'utf8'), 'existing=true\n');

      const missingOutput = spawnSync(process.execPath, [script], {
        encoding: 'utf8', env: { ...process.env, DECISION: '{"decision":"PASS"}', GITHUB_OUTPUT: '' },
      });
      assert.notEqual(missingOutput.status, 0);
      assert.match(missingOutput.stderr, /GITHUB_OUTPUT is required\./);
      assert.equal(readFileSync(output, 'utf8'), 'existing=true\n');
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
