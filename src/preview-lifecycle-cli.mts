#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { preparePreviewLifecycle, completePreviewLifecycle, observePreviewLifecycle,
  prepareFreshPreviewReview, previewReceiptBytes } from './preview-lifecycle.mjs';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';

type CliCommand = 'prepare' | 'complete' | 'finalize' | 'fresh';
type CliFailureCode = 'usage' | 'input' | 'input-too-large' | 'invalid-utf8' | 'duplicate-json' |
  'json-depth' | 'receipt-too-large' | 'invalid-json' | 'invalid-input' | 'checkout-mismatch' |
  'prepare-failed' | 'complete-failed' | 'finalize-failed' | 'fresh-failed' | 'output-failed';
type JsonObject = Record<string, unknown>;

const MAX_INPUT_BYTES = 16 * 1024 * 1024;
const utf8 = (bytes: Buffer): string => new TextDecoder('utf-8', { fatal: true }).decode(bytes);
class CliFailure extends Error {
  declare readonly code: CliFailureCode;

  constructor(code: CliFailureCode) {
    super(code);
    this.code = code;
  }
}

function exact(value: unknown, keys: readonly string[], label: string): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).sort().join('\0') !== [...keys].sort().join('\0')) throw new Error(`${label} fields are invalid.`);
}

function parse(source: string, label: string, maxDepth = 128): unknown {
  let value: unknown;
  try {
    rejectDuplicateJsonKeys(source, label, { maxDepth });
    value = JSON.parse(source) as unknown;
  } catch (error: unknown) {
    const message = typeof (error as { message?: unknown } | null | undefined)?.message === 'string'
      ? (error as { message: string }).message : '';
    if (/duplicate JSON key/.test(message)) throw new CliFailure('duplicate-json');
    if (/nesting is too deep/.test(message)) throw new CliFailure('json-depth');
    throw new CliFailure('invalid-json');
  }
  if (containsNonFiniteNumber(value)) throw new CliFailure('invalid-json');
  return value;
}

function containsNonFiniteNumber(value: unknown): boolean {
  if (typeof value === 'number') return !Number.isFinite(value);
  if (Array.isArray(value)) return value.some(containsNonFiniteNumber);
  if (value && typeof value === 'object') return Object.values(value).some(containsNonFiniteNumber);
  return false;
}

async function input(): Promise<unknown> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_INPUT_BYTES) throw new CliFailure('input-too-large');
    chunks.push(chunk);
  }
  if (!size) throw new CliFailure('invalid-input');
  let source: string;
  try { source = utf8(Buffer.concat(chunks)); }
  catch { throw new CliFailure('invalid-utf8'); }
  return parse(source, 'preview lifecycle CLI input');
}

function spec(value: unknown): void {
  exact(value, ['version', 'repository', 'targetBranch', 'baseSha', 'headSha', 'mode', 'selectionPath', 'trigger', 'record'], 'spec');
}

function rootOf(value: unknown): string {
  const root = realpathSync(process.cwd());
  if (value !== root) throw new CliFailure('checkout-mismatch');
  return root;
}

async function run(command: CliCommand, value: unknown, cwd: string): Promise<unknown> {
  if (command === 'prepare') {
    exact(value, ['spec'], 'prepare input'); spec(value.spec);
    const request = await preparePreviewLifecycle(value.spec, cwd);
    if (request.root !== cwd) throw new CliFailure('checkout-mismatch');
    return request;
  }
  if (command === 'complete') {
    exact(value, ['request', 'responseJson'], 'complete input');
    if (typeof value.responseJson !== 'string') throw new Error('responseJson must be an exact UTF-8 JSON string.');
    const response = parse(value.responseJson, 'review response', 64);
    return completePreviewLifecycle(value.request, response,
      rootOf((value.request as { root?: unknown } | null | undefined)?.root));
  }
  if (command === 'finalize') {
    exact(value, ['receiptJson', 'integrationSha'], 'finalize input');
    if (typeof value.receiptJson !== 'string') throw new Error('receiptJson must be an exact UTF-8 JSON string.');
    const receipt = parse(value.receiptJson, 'exact receipt', 68);
    if (!Buffer.from(value.receiptJson, 'utf8').equals(previewReceiptBytes(receipt))) {
      throw new CliFailure('finalize-failed');
    }
    const cwd = rootOf((receipt as { request?: { root?: unknown } | null } | null | undefined)?.request?.root);
    return observePreviewLifecycle(receipt, value.integrationSha, cwd, Buffer.from(value.receiptJson, 'utf8'));
  }
  if (command === 'fresh') {
    exact(value, ['finalRecord', 'aHeadSha'], 'fresh input');
    return prepareFreshPreviewReview(value.finalRecord, value.aHeadSha,
      rootOf((value.finalRecord as { receipt?: { request?: { root?: unknown } | null } | null } | null | undefined)?.receipt?.request?.root));
  }
  throw new Error('command must be prepare, complete, finalize, or fresh.');
}

async function writeStdout(output: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    // Keep this listener through process exit: some Writable paths invoke the
    // callback with an error before emitting the matching `error` event.
    process.stdout.on('error', fail);
    process.stdout.on('close', () => fail(new Error('stdout closed')));
    process.stdout.write(output, (error?: Error | null) => {
      if (error) fail(error);
      else if (!settled) {
        settled = true;
        resolve();
      }
    });
  });
}

async function main(): Promise<void> {
  let category: CliFailureCode = 'usage';
  try {
    if (process.argv.length !== 3) throw new CliFailure('usage');
    const command = process.argv[2] as CliCommand;
    if (!['prepare', 'complete', 'finalize', 'fresh'].includes(command)) throw new CliFailure('usage');
    category = 'input';
    const value = await input();
    const cwd = realpathSync(process.cwd());
    category = `${command}-failed`;
    const result = await run(command, value, cwd);
    const output = previewReceiptBytes(result);
    if (command === 'complete' && output.length > 4_194_304) throw new CliFailure('receipt-too-large');
    category = 'output-failed';
    await writeStdout(output);
  } catch (error: unknown) {
    // Input and core messages may contain repository values or JSON keys.
    // Emit only a fixed category, never untrusted content or core diagnostics.
    const code = error instanceof CliFailure ? error.code : category;
    const descriptions: Record<CliFailureCode, string> = { usage: 'expected prepare, complete, finalize, or fresh.', input: 'input failed.',
      'input-too-large': 'stdin exceeds 16 MiB.', 'invalid-utf8': 'stdin is not valid UTF-8.',
      'duplicate-json': 'JSON contains duplicate keys.', 'json-depth': 'JSON nesting exceeds the supported depth.',
      'receipt-too-large': 'completed receipt exceeds 4 MiB.',
      'invalid-json': 'JSON is invalid.', 'invalid-input': 'stdin is empty or invalid.',
      'checkout-mismatch': 'record checkout does not match the invoking working directory.',
      'prepare-failed': 'prepare failed.', 'complete-failed': 'complete failed.',
      'finalize-failed': 'finalize failed.', 'fresh-failed': 'fresh failed.',
      'output-failed': 'stdout write failed; the result may be incomplete.' };
    process.stderr.write(`architecture-preview-lifecycle: ${descriptions[code] ?? 'operation failed; no result was produced.'}\n`);
    process.exitCode = 1;
  }
}

await main();
