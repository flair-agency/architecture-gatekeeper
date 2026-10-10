/**
 * Internal stdin/GitHub bridge for host-observed CI execution status.
 *
 * This reports only whether the host reports success with bounded response
 * bytes. It does not authenticate the supplied selection or interpret the
 * response. Callers must provide trusted, revision-bound metadata; fixed GitHub inputs
 * describe expected configuration, not authenticated backend execution.
 */
import { TextDecoder } from 'node:util';
import { rejectDuplicateJsonKeys } from '../authority-set.mjs';
import { normalizeCiExecutionResult } from './ci-execution-result.mts';
import { appendGitHubOutput } from '../runner-temp-path.mjs';

const MAX_STDIN_BYTES = 512 * 1024;
const MAX_RESPONSE_BYTES = 65_536;
const ALLOWED_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped', 'unknown']);
const utf8 = new TextDecoder('utf-8', { fatal: true });
const ERROR_MESSAGE = 'Invalid CI execution observation input.';

type InputStream = AsyncIterable<Uint8Array> & { destroy(): unknown };
type OutputStream = { write(value: string): unknown };

async function readBoundedStdin(stream: InputStream): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
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

function parseEnvelope(bytes: Buffer): Record<string, unknown> {
  const text = utf8.decode(bytes);
  // The duplicate-key scanner expects syntactically complete JSON; parsing
  // first also makes truncated input fail without entering that scanner.
  const envelope: unknown = JSON.parse(text);
  rejectDuplicateJsonKeys(text, 'CI execution observation', { maxDepth: 70 });
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.getPrototypeOf(envelope) !== Object.prototype) {
    throw new Error('invalid envelope');
  }
  const keys = Object.keys(envelope as Record<string, unknown>);
  const expectedKeys = ['expectedExecution', 'hostStepOutcome', 'rawResponse', 'maxResponseBytes'];
  if (keys.length !== expectedKeys.length || expectedKeys.some(key => !Object.hasOwn(envelope as object, key)) ||
      keys.some(key => !expectedKeys.includes(key))) {
    throw new Error('invalid envelope keys');
  }
  if (!ALLOWED_OUTCOMES.has((envelope as Record<string, unknown>).hostStepOutcome as string) ||
      ((envelope as Record<string, unknown>).rawResponse !== null && typeof (envelope as Record<string, unknown>).rawResponse !== 'string') ||
      !Number.isSafeInteger((envelope as Record<string, unknown>).maxResponseBytes) || ((envelope as Record<string, unknown>).maxResponseBytes as number) < 1 ||
      ((envelope as Record<string, unknown>).maxResponseBytes as number) > MAX_RESPONSE_BYTES) {
    throw new Error('invalid envelope metadata');
  }
  const settings = ((envelope as Record<string, unknown>).expectedExecution as { requestedSettings?: unknown } | null | undefined)?.requestedSettings;
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new Error('invalid expected settings');
  }
  return envelope as Record<string, unknown>;
}

export async function runCiExecutionObservationCli({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
}: {
  stdin?: InputStream;
  stdout?: OutputStream;
  stderr?: OutputStream;
} = {}): Promise<number> {
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

type GitHubEnvironment = Record<string, unknown>;

function githubEnvelope(env: GitHubEnvironment): Record<string, unknown> {
  const encoded = env.REVIEW_SETTINGS_BASE64;
  if (typeof encoded !== 'string' || encoded.length === 0 || encoded.length > 5_464 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('invalid settings encoding');
  const bytes = Buffer.from(encoded, 'base64');
  if (bytes.length > 4_096 || bytes.toString('base64') !== encoded) throw new Error('invalid settings encoding');
  const text = utf8.decode(bytes);
  const settings: unknown = JSON.parse(text);
  rejectDuplicateJsonKeys(text, 'CI execution settings', { maxDepth: 64 });
  return {
    expectedExecution: {
      provider: env.REVIEW_PROVIDER,
      requestedModel: env.REVIEW_MODEL,
      requestedSettings: settings,
    },
    hostStepOutcome: env.REVIEW_OUTCOME,
    rawResponse: env.REVIEW_RESPONSE,
    maxResponseBytes: MAX_RESPONSE_BYTES,
  };
}

export function runCiExecutionObservationGitHubCli(
  env: GitHubEnvironment = process.env,
  stderr: OutputStream = process.stderr,
): number {
  try {
    const result = normalizeCiExecutionResult(githubEnvelope(env));
    appendGitHubOutput(`execution_status=${result.status}\n`);
    return result.status === 'completed' ? 0 : 1;
  } catch {
    stderr.write(`${ERROR_MESSAGE}\n`);
    return 1;
  }
}
