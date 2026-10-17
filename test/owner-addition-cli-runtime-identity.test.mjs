import assert from 'node:assert/strict';
import { appendFileSync, copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ordinary, decision, fixture, spec, commitOn } from './fixtures/preview-lifecycle-runtime.mjs';

const packageRoot = dirname(dirname(fileURLToPath(import.meta.resolve('@flair-agency/architecture-gatekeeper/preview-lifecycle'))));
const operations = [
  ['owner-addition/owner-addition-ci-operations.mjs', 'owner-addition/owner-addition-ci-operations.mts'],
  ['owner-addition/owner-addition-multiauthority.mjs', 'owner-addition/owner-addition-multiauthority.mts'],
];
const sha256 = path => createHash('sha256').update(readFileSync(path)).digest('hex');

test('new owner-addition leaves bind actual runtime requests and receipts in emitted and native-source layouts', async t => {
  const f = fixture(t);
  const head = commitOn(f, 'owner-addition-runtime-identity', { 'app.txt': 'Runtime identity fixture\n' });
  const requestSpec = spec(f, 'review', head);
  for (const [layout, extensionIndex] of [['dist', 0], ['src', 1]]) {
    const root = mkdtempSync(join(tmpdir(), `owner-addition-${layout}-identity-`));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    cpSync(join(packageRoot, layout), join(root, layout), { recursive: true });
    copyFileSync(join(packageRoot, 'package.json'), join(root, 'package.json'));
    const runtimePath = join(root, layout, 'preview-lifecycle.mjs');
    const runtime = await import(`${pathToFileURL(runtimePath).href}?owner-addition-${layout}`);
    const suffix = extensionIndex === 0 ? 0 : 1;
    const leaves = operations.map(paths => paths[suffix]);
    const baseline = await runtime.preparePreviewLifecycle(requestSpec, f.root);
    const baselineReceipt = await runtime.completePreviewLifecycle(baseline, ordinary(decision()), f.root);
    await runtime.validatePreviewReceipt(baselineReceipt, f.root);

    for (const leaf of leaves) {
      const path = join(root, layout, leaf);
      const original = readFileSync(path);
      assert.equal(baseline.runtime.files[leaf], sha256(path), `${layout}/${leaf} is in the bound runtime closure`);
      try {
        appendFileSync(path, '\n// isolated identity mutation\n');
        assert.notEqual(sha256(path), baseline.runtime.files[leaf]);
        await assert.rejects(runtime.completePreviewLifecycle(baseline, ordinary(decision()), f.root),
          /request differs from immutable predecessor inputs/);
        await assert.rejects(runtime.validatePreviewReceipt(baselineReceipt, f.root),
          /request differs from immutable predecessor inputs/);
        const fresh = await runtime.preparePreviewLifecycle(requestSpec, f.root);
        assert.equal(fresh.runtime.files[leaf], sha256(path));
        assert.notEqual(fresh.runtime.files[leaf], baseline.runtime.files[leaf]);
        const freshReceipt = await runtime.completePreviewLifecycle(fresh, ordinary(decision()), f.root);
        await runtime.validatePreviewReceipt(freshReceipt, f.root);
      } finally {
        writeFileSync(path, original);
      }
    }
  }
});
