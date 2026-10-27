import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, copyFileSync, cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fixture, spec, commitOn, ordinary, decision } from './fixtures/preview-lifecycle-runtime.mjs';
const root = dirname(dirname(fileURLToPath(import.meta.url)));
for (const [layout, extension] of [['src', 'mts'], ['dist', 'mjs']]) {
  test(`${layout} actual flat lifecycle leaf binds fresh requests and receipts and rejects changed implementation bytes`, async t => {
    const isolated = mkdtempSync(join(tmpdir(), `preview-full-${layout}-`));
    t.after(() => rmSync(isolated, { recursive: true, force: true }));
    cpSync(join(root, layout), join(isolated, layout), { recursive: true });
    copyFileSync(join(root, 'package.json'), join(isolated, 'package.json'));
    symlinkSync(join(root, 'node_modules'), join(isolated, 'node_modules'), 'dir');
    const runtime = await import(pathToFileURL(join(isolated, layout, `preview-lifecycle.${layout === 'src' ? 'mts' : 'mjs'}`)).href);
    const f = fixture(t);
    const head = commitOn(f, `full-${layout}`, { 'app.txt': 'Synthetic lifecycle identity change\n' });
    const request = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
    const leaf = `preview-lifecycle-runtime.${extension}`;
    const digest = file => createHash('sha256').update(readFileSync(file)).digest('hex');
    assert.equal(request.runtime.files[leaf], digest(join(isolated, layout, leaf)));
    assert.equal(request.runtime.files[`preview-lifecycle.${extension}`], digest(join(isolated, layout, `preview-lifecycle.${layout === 'src' ? 'mts' : 'mjs'}`)));
    assert.equal(request.runtime.files['../package.json'], digest(join(isolated, 'package.json')));
    const receipt = await runtime.completePreviewLifecycle(request, ordinary(decision()), f.root);
    assert.equal(await runtime.validatePreviewReceipt(receipt, f.root), receipt);
    appendFileSync(join(isolated, layout, leaf), '\n// Isolated implementation identity mutation.\n');
    await assert.rejects(runtime.completePreviewLifecycle(request, ordinary(decision()), f.root), /immutable predecessor inputs/);
    await assert.rejects(runtime.validatePreviewReceipt(receipt, f.root), /immutable predecessor inputs/);
    const fresh = await runtime.preparePreviewLifecycle(spec(f, 'review', head), f.root);
    assert.notEqual(fresh.runtime.files[leaf], request.runtime.files[leaf]);
    const freshReceipt = await runtime.completePreviewLifecycle(fresh, ordinary(decision()), f.root);
    assert.equal(await runtime.validatePreviewReceipt(freshReceipt, f.root), freshReceipt);
  });
}
