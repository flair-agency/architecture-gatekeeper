#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { preparePreviewLifecycle, completePreviewLifecycle, observePreviewLifecycle,
  prepareFreshPreviewReview, previewReceiptBytes } from './preview-lifecycle.mjs';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const utf8 = bytes => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
class CliFailure extends Error { constructor(code) { super(code); this.code = code; } }
function exact(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`${label} fields are invalid.`);
}
function parse(source, label, maxDepth = 128) {
  try {
    rejectDuplicateJsonKeys(source, label, { maxDepth });
    return JSON.parse(source);
  } catch (error) {
    const message = typeof error?.message === 'string' ? error.message : '';
    if (/duplicate JSON key/.test(message)) throw new CliFailure('duplicate-json');
    if (/nesting is too deep/.test(message)) throw new CliFailure('json-depth');
    throw new CliFailure('invalid-json');
  }
}
async function input() {
  const chunks = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new CliFailure('input-too-large');
    chunks.push(chunk);
  }
  if (!size) throw new CliFailure('invalid-input');
  let source;
  try { source = utf8(Buffer.concat(chunks)); }
  catch { throw new CliFailure('invalid-utf8'); }
  return parse(source, 'preview lifecycle CLI input');
}
function spec(value) {
  exact(value, ['version', 'repository', 'targetBranch', 'baseSha', 'headSha', 'mode', 'selectionPath', 'trigger', 'record'], 'spec');
}
function rootOf(value) {
  const root = realpathSync(process.cwd());
  if (value !== root) throw new CliFailure('checkout-mismatch');
  return root;
}
async function run(command, value, cwd) {
  if (command === 'prepare') {
    exact(value, ['spec'], 'prepare input'); spec(value.spec);
    return preparePreviewLifecycle(value.spec, cwd);
  }
  if (command === 'complete') {
    exact(value, ['request', 'responseJson'], 'complete input');
    if (typeof value.responseJson !== 'string') throw new Error('responseJson must be an exact UTF-8 JSON string.');
    const response = parse(value.responseJson, 'review response', 64);
    return completePreviewLifecycle(value.request, response, rootOf(value.request?.root));
  }
  if (command === 'finalize') {
    exact(value, ['receiptJson', 'integrationSha'], 'finalize input');
    if (typeof value.receiptJson !== 'string') throw new Error('receiptJson must be an exact UTF-8 JSON string.');
    const receipt = parse(value.receiptJson, 'exact receipt', 68);
    const cwd = rootOf(receipt?.request?.root);
    return observePreviewLifecycle(receipt, value.integrationSha, cwd, Buffer.from(value.receiptJson, 'utf8'));
  }
  if (command === 'fresh') {
    exact(value, ['finalRecord', 'aHeadSha'], 'fresh input');
    return prepareFreshPreviewReview(value.finalRecord, value.aHeadSha, rootOf(value.finalRecord?.receipt?.request?.root));
  }
  throw new Error('command must be prepare, complete, finalize, or fresh.');
}

async function main() {
  let category = 'usage';
  try {
    if (process.argv.length !== 3) throw new CliFailure('usage');
    const command = process.argv[2];
    if (!['prepare', 'complete', 'finalize', 'fresh'].includes(command)) throw new CliFailure('usage');
    category = 'input';
    const value = await input();
    const cwd = realpathSync(process.cwd());
    category = `${command}-failed`;
    const result = await run(command, value, cwd);
    const output = previewReceiptBytes(result);
    if (command === 'complete' && output.length > 4_194_304) throw new CliFailure('receipt-too-large');
    process.stdout.write(output);
  } catch (error) {
    // Input and core messages may contain repository values or JSON keys.
    // Emit only a fixed category, never untrusted content or core diagnostics.
    const code = error instanceof CliFailure ? error.code : category;
    const descriptions = { usage: 'expected prepare, complete, finalize, or fresh.', input: 'input failed.',
      'input-too-large': 'stdin exceeds 16 MiB.', 'invalid-utf8': 'stdin is not valid UTF-8.',
      'duplicate-json': 'JSON contains duplicate keys.', 'json-depth': 'JSON nesting exceeds the supported depth.',
      'receipt-too-large': 'completed receipt exceeds 4 MiB.',
      'invalid-json': 'JSON is invalid.', 'invalid-input': 'stdin is empty or invalid.',
      'checkout-mismatch': 'record checkout does not match the invoking working directory.',
      'prepare-failed': 'prepare failed.', 'complete-failed': 'complete failed.',
      'finalize-failed': 'finalize failed.', 'fresh-failed': 'fresh failed.' };
    process.stderr.write(`architecture-preview-lifecycle: ${descriptions[code] ?? 'operation failed; no result was produced.'}\n`);
    process.exitCode = 1;
  }
}

await main();
