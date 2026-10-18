// Test preload: instruments the two selected files, intercepts the CLI's
// fixed execFileSync gh call, and blocks global fetch.
import fs from 'node:fs';
import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { basename, dirname } from 'node:path';
import { TextDecoder } from 'node:util';

const expectedPath = process.env.ISSUE83_EXPECTED_PATH;
const recordPath = process.env.ISSUE83_RECORD_PATH;
const mode = process.env.ISSUE83_READ_MODE;
const native = { openSync: fs.openSync, readSync: fs.readSync, closeSync: fs.closeSync,
  readFileSync: fs.readFileSync, decode: TextDecoder.prototype.decode };
const descriptorPaths = new Map();
const closed = new Set();
const trace = { reads: {}, closes: [], children: [], frozen: null, decodeObserved: false, decodeAfterClose: false };

fs.openSync = (path, ...args) => {
  const descriptor = native.openSync(path, ...args);
  if (String(path) === expectedPath || String(path) === recordPath) descriptorPaths.set(descriptor, String(path));
  return descriptor;
};
fs.readSync = (descriptor, buffer, offset, length, position) => {
  const path = descriptorPaths.get(descriptor);
  if (!path) return native.readSync(descriptor, buffer, offset, length, position);
  const counts = trace.reads[path] ||= { calls: 0, bytes: 0, positiveReads: 0 };
  counts.calls++;
  const selected = mode.startsWith('record-') ? recordPath : expectedPath;
  if (path === selected && mode.endsWith('read-error')) throw new Error('injected benign read error');
  if (path === selected && mode.endsWith('early-eof') && counts.calls > 1) return 0;
  const count = native.readSync(descriptor, buffer, offset, Math.min(length, 2), position);
  counts.bytes += count;
  if (count > 0) counts.positiveReads++;
  return count;
};
fs.closeSync = descriptor => {
  const path = descriptorPaths.get(descriptor);
  if (!path) return native.closeSync(descriptor);
  closed.add(path);
  trace.closes.push(path);
  descriptorPaths.delete(descriptor);
  return native.closeSync(descriptor);
};
TextDecoder.prototype.decode = function (input, options) {
  if (mode === 'decode-after-close' && Buffer.from(input).equals(Buffer.from(process.env.ISSUE83_INVALID_EXPECTED_BASE64, 'base64'))) {
    trace.decodeObserved = true;
    trace.decodeAfterClose = closed.has(expectedPath);
  }
  return native.decode.call(this, input, options);
};

// The first gh call occurs only after both private descriptor reads and the
// frozen-record write. Stop there so no real command or network path executes.
globalThis.fetch = async () => { throw new Error('blocked unexpected network request'); };
childProcess.execFileSync = (file, args = [], options = {}) => {
  trace.children.push({ file: String(file), args: [...args], timeout: options.timeout, maxBuffer: options.maxBuffer });
  const root = process.env.TMPDIR;
  const frozen = args[2];
  const exact = String(file) === 'gh' && args.length === 15 && args[0] === 'attestation' && args[1] === 'verify' &&
    args[3] === '--repo' && args[4] === 'flair-agency/architecture-gatekeeper' &&
    args[5] === '--signer-workflow' && args[6] === 'flair-agency/architecture-gatekeeper/.github/workflows/issue83-real-pr-block-probe.yml' &&
    args[7] === '--signer-digest' && args[8] === process.env.ISSUE83_EXPECTED_BASE_SHA &&
    args[9] === '--source-digest' && args[10] === process.env.ISSUE83_EXPECTED_BASE_SHA &&
    args[11] === '--source-ref' && args[12] === 'refs/heads/main' && args[13] === '--format' && args[14] === 'json' &&
    options.timeout === 30_000 && options.maxBuffer === 4 * 1024 * 1024 &&
    trace.closes.length === 2 && trace.closes[0] === expectedPath && trace.closes[1] === recordPath &&
    trace.reads[expectedPath]?.positiveReads > 0 && trace.reads[recordPath]?.positiveReads > 0 &&
    typeof frozen === 'string' && basename(frozen) === 'issue83-real-pr-block-record.json' &&
    dirname(dirname(frozen)) === root && basename(dirname(frozen)).startsWith('issue83-block-');
  if (!exact) throw new Error('blocked unexpected child-process invocation');
  trace.frozen = { path: frozen, bytes: native.readFileSync(frozen).toString('base64') };
  throw new Error('blocked first gh call');
};
syncBuiltinESMExports();
process.on('exit', () => process.stderr.write(`ISSUE83_READER_TRACE ${JSON.stringify(trace)}\n`));
