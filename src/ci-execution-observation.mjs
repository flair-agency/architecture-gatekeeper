/**
 * Inactive stdin bridge for host-observed CI execution status.
 *
 * This reports only whether the host reports success with bounded response
 * bytes. It does not authenticate the supplied selection or interpret the
 * response. A future caller must provide trusted, revision-bound metadata.
 */
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { rejectDuplicateJsonKeys } from './authority-set.mjs';
import { normalizeCiExecutionResult } from './ci-execution-result.mjs';

const MAX_STDIN_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 65_536;
const ALLOWED_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped', 'unknown']);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const ERROR_MESSAGE = 'Invalid CI execution observation input.';

async function readBoundedStdin(stream) {
  const chunks = [];
  let length = 0;
  for await (const chunk of stream) {
    length += chunk.length;
    if (length > MAX_STDIN_BYTES) {
      stream.destroy();
      throw new Error('input too large');
    }
    chunks.push(chunk);
  }
  if (length === 0) throw new Error('empty input');
  return Buffer.concat(chunks, length);
}

function parseEnvelope(bytes) {
  const text = utf8.decode(bytes);
  // The duplicate-key scanner expects syntactically complete JSON; parsing
  // first also makes truncated input fail without entering that scanner.
  const envelope = JSON.parse(text);
  rejectDuplicateJsonKeys(text, 'CI execution observation', { maxDepth: 70 });
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.getPrototypeOf(envelope) !== Object.prototype) {
    throw new Error('invalid envelope');
  }
  const keys = Object.keys(envelope);
  const expectedKeys = ['expectedExecution', 'hostStepOutcome', 'rawResponse', 'maxResponseBytes'];
  if (keys.length !== expectedKeys.length || expectedKeys.some(key => !Object.hasOwn(envelope, key)) ||
      keys.some(key => !expectedKeys.includes(key))) {
    throw new Error('invalid envelope keys');
  }
  if (!ALLOWED_OUTCOMES.has(envelope.hostStepOutcome) ||
      (envelope.rawResponse !== null && typeof envelope.rawResponse !== 'string') ||
      !Number.isSafeInteger(envelope.maxResponseBytes) || envelope.maxResponseBytes < 1 ||
      envelope.maxResponseBytes > MAX_RESPONSE_BYTES) {
    throw new Error('invalid envelope metadata');
  }
  const settings = envelope.expectedExecution?.requestedSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('invalid expected settings');
  }
  return envelope;
}

export async function runCiExecutionObservationCli({ stdin = process.stdin, stdout = process.stdout, stderr = process.stderr } = {}) {
  try {
    const envelope = parseEnvelope(await readBoundedStdin(stdin));
    const result = normalizeCiExecutionResult(envelope);
    stdout.write(`status=${result.status}\n`);
    return result.status === 'completed' ? 0 : 1;
  } catch {
    stderr.write(`${ERROR_MESSAGE}\n`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runCiExecutionObservationCli();
}
