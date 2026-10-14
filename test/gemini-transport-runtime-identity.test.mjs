import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, cpSync, copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { commitOn, decision, fixture, ordinary, spec } from './fixtures/preview-lifecycle-runtime.mjs';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

test('Gemini transport emitted leaf is bound by fresh and stale preview runtime identities', async t => {
  const packageRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@flair-agency/architecture-gatekeeper/preview-lifecycle'))));
  const runtimeRoot = mkdtempSync(join(tmpdir(), 'gemini-transport-runtime-layout-'));
  t.after(() => rmSync(runtimeRoot, { recursive: true, force: true }));
  cpSync(join(packageRoot, 'dist'), join(runtimeRoot, 'dist'), { recursive: true });
  copyFileSync(join(packageRoot, 'package.json'), join(runtimeRoot, 'package.json'));
  const runtime = await import(pathToFileURL(join(runtimeRoot, 'dist/preview-lifecycle.mjs')).href);
  const f = fixture(t);
  const head = commitOn(f, 'gemini-transport-runtime-identity', { 'app.txt': 'Synthetic runtime identity fixture\n' });
  const leafPath = 'reviewer-transports/gemini-transport.mjs';
  const leafFile = join(runtimeRoot, 'dist', leafPath);
  const originalLeaf = readFileSync(leafFile);
  const request = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
  assert.equal(request.runtime.files[leafPath], sha256(originalLeaf));
  const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
  await runtime.validatePreviewReceipt(receipt, f.root);

  try {
    appendFileSync(leafFile, '\n// isolated Gemini runtime identity mutation\n');
    assert.notEqual(sha256(readFileSync(leafFile)), request.runtime.files[leafPath]);
    await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root), /request differs from immutable predecessor inputs/);
    await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root), /request differs from immutable predecessor inputs/);
  } finally {
    writeFileSync(leafFile, originalLeaf);
  }

  appendFileSync(leafFile, '\n// isolated fresh Gemini runtime identity mutation\n');
  try {
    const freshRequest = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
    assert.notEqual(freshRequest.runtime.files[leafPath], request.runtime.files[leafPath]);
    assert.equal(freshRequest.runtime.files[leafPath], sha256(readFileSync(leafFile)));
    const freshReceipt = await runtime.completePreviewLifecycle(freshRequest, ordinary(decision()), f.root);
    await runtime.validatePreviewReceipt(freshReceipt, f.root);
  } finally {
    writeFileSync(leafFile, originalLeaf);
  }
});
