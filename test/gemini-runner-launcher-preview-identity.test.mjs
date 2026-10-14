import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { ordinary, decision, fixture, spec, commitOn } from './fixtures/preview-lifecycle-runtime.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

for (const layout of ['src', 'dist']) test(`${layout} preview identity binds all provider leaves and rejects stale requests and receipts`, async t => {
  const sourceRoot = mkdtempSync(join(tmpdir(), 'gemini-runner-launcher-source-runtime-'));
  t.after(() => rmSync(sourceRoot, { recursive: true, force: true }));
  cpSync(new URL(`../${layout}`, import.meta.url), join(sourceRoot, layout), { recursive: true });
  copyFileSync(new URL('../package.json', import.meta.url), join(sourceRoot, 'package.json'));
  const runtime = await import(pathToFileURL(join(sourceRoot, layout, 'preview-lifecycle.mjs')).href);
  const f = fixture(t);
  const head = commitOn(f, 'gemini-runner-launcher-runtime-identity', { 'app.txt': 'Changed application\n' });
  const requestSpec = spec(f, 'review', head);
  const extension = layout === 'src' ? 'mts' : 'mjs';
  const leaves = ['gemini-cli/ci-runner-entrypoint', 'gemini-cli/launcher-entrypoint', 'gemini-cli/gemini-security-proxy', 'reviewer-transports/gemini-transport'].map(leaf => `${leaf}.${extension}`);

  for (const leaf of leaves) {
    const path = join(sourceRoot, layout, leaf);
    const original = readFileSync(path);
    const request = await runtime.preparePreviewLifecycle(requestSpec, f.root);
    assert.equal(request.runtime.files[leaf], digest(original), `${leaf} is in the actual preview runtime identity`);
    const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
    await runtime.validatePreviewReceipt(receipt, f.root);

    try {
      appendFileSync(path, '\n// isolated source-byte mutation\n');
      const freshRequest = await runtime.preparePreviewLifecycle(requestSpec, f.root);
      assert.notEqual(freshRequest.runtime.files[leaf], request.runtime.files[leaf]);
      await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root),
        /request differs from immutable predecessor inputs/);
      await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root),
        /request differs from immutable predecessor inputs/);
      const freshReceipt = await runtime.completePreviewLifecycle(freshRequest, ordinary(decision()), f.root);
      await runtime.validatePreviewReceipt(freshReceipt, f.root);
    } finally {
      writeFileSync(path, original);
    }
  }
});
