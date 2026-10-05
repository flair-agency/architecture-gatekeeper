#!/usr/bin/env node
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { preparePreviewLifecycle, completePreviewLifecycle, observePreviewLifecycle, prepareFreshPreviewReview, previewReceiptBytes } from './preview-lifecycle.mjs';

const usage = 'Usage: architecture-preview-lifecycle prepare <spec.json> <request.json> | complete <request.json> <decision.json> <receipt.json> | observe <receipt.json> <merge-sha> <final.json> | fresh-review <final.json> <new-A-sha> <request.json>';
function read(path) {
  const bytes = readFileSync(path);
  if (bytes.length > 4_194_304) throw new Error('Preview input exceeds 4 MiB.');
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const value = JSON.parse(source);
  // Nested receipts contain requests and trigger receipts, deeper than a manifest.
  // Keep duplicate-key rejection local rather than raising production selector bounds.
  const stack = [];
  for (const [token] of source.matchAll(/"(?:\\.|[^"\\])*"|[{}\[\],:]/g)) {
    if (token === '{' || token === '[') {
      if (stack.length >= 64) throw new Error('Preview JSON nesting exceeds 64.');
      stack.push({ object: token === '{', key: token === '{', seen: new Set() });
    } else if (token === '}' || token === ']') stack.pop();
    else if (token === ',' && stack.at(-1)?.object) stack.at(-1).key = true;
    else if (token.startsWith('"') && stack.at(-1)?.key) {
      const frame = stack.at(-1), key = JSON.parse(token);
      if (frame.seen.has(key)) throw new Error(`Duplicate preview JSON key: ${key}`);
      frame.seen.add(key); frame.key = false;
    }
  }
  return value;
}
export async function runPreviewLifecycleCli(args = process.argv.slice(2), cwd = process.cwd()) {
  const [command, input, extra, output] = args;
  let result, destination;
  if (command === 'prepare' && args.length === 3) {
    result = await preparePreviewLifecycle(read(input), cwd); destination = extra;
  } else if (command === 'complete' && args.length === 4) {
    result = await completePreviewLifecycle(read(input), read(extra), cwd); destination = output;
  } else if (command === 'observe' && args.length === 4) {
    result = await observePreviewLifecycle(read(input), extra, cwd, readFileSync(input)); destination = output;
  } else if (command === 'fresh-review' && args.length === 4) {
    result = await prepareFreshPreviewReview(read(input), extra, cwd); destination = output;
  } else throw new Error(usage);
  writeFileSync(destination, result.kind === 'preview-lifecycle-receipt' ? previewReceiptBytes(result) : `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ profile: result.profile, kind: result.kind,
    adoption: result.adoption ?? 'PENDING', canonical: result.canonical ?? 'PENDING',
    assurance: result.assurance, output: destination })}\n`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  runPreviewLifecycleCli().catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 2; });
}
