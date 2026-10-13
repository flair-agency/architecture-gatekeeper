import { MEASUREMENT_ENVELOPE_FIELDS, validateMeasurementPhases } from './measurement-consistency.mts';
import { rejectDuplicateJsonKeys, readCommittedAuthorityFile } from './authority-set.mjs';
import { isCanonicalRepositoryPath } from './legacy-git-snapshot.mjs';
import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, opendirSync, readFileSync, readSync, realpathSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { readDiagnosticText, resolveDiagnosticPath } from './diagnostic-path.mts';

export type MeasurementFields = Record<string, unknown>;
// External payloads remain unknown; these views describe property access and
// do not establish authenticated records or reviewer execution.
export interface MeasurementRequest {
  requestId?: unknown; reviewedRevision?: unknown; prompt?: unknown; schema?: unknown;
  reviewer?: unknown; authoritySet?: unknown; repositoryRoot?: string;
}
interface CapturedRequest {
  requestId: unknown; reviewedRevision: unknown; promptSha256: string | null;
  selectedPromptSha256: string | null; schemaSha256: string | null;
  authoritySet: unknown; requestedReviewer: unknown; scope: MeasurementFields;
  selectedInputDigests?: MeasurementFields;
}
export interface MeasurementRecord {
  version: number; kind: string; attemptId: string; phase: string; route: string;
  startedAt: unknown; completedAt?: unknown; elapsedMs?: unknown; state?: unknown;
  runtime?: unknown; repositoryId?: unknown; changeId?: unknown; sessionId?: unknown;
  correlation?: unknown; context?: unknown; ci?: unknown; request?: unknown;
  decision?: unknown; execution?: unknown; feedback?: unknown; observation?: unknown;
  findingCount?: unknown; scopeKind?: unknown;
}
// Localized operation views preserve the existing runtime reads and coercions.
// The public validator does not narrow these unchecked observations.
type RecordView = MeasurementRecord & {
  startedAt: string; completedAt?: string; state?: string;
  request?: CapturedRequest | null; context?: MeasurementFields;
  feedback?: MeasurementFields; observation?: MeasurementFields;
};
export interface MeasurementFinish {
  state?: string; decision?: unknown; execution?: unknown; publication?: string;
  observation?: MeasurementFields;
}
export interface MeasurementAttempt {
  id: string | null;
  request(value: MeasurementRequest, scope?: MeasurementFields, transportPrompt?: unknown): void;
  finish(value?: MeasurementFinish): void;
}
export interface MeasurementOptions {
  route?: string; cwd?: string; directory?: string; changeId?: string;
  sessionId?: unknown; correlation?: string; context?: MeasurementFields;
}
type DecisionView = { decision?: unknown; findings?: unknown };
// Reuse the existing bounded committed-file reader for diagnostic metadata only.
// Required snapshot callers retain their original implementation and behavior.
function measurementGitSnapshot(root: string, commit: unknown, path: unknown, remainingTimeMs: () => number) {
  if (typeof commit !== 'string' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(commit) || !isCanonicalRepositoryPath(path)) {
    throw new Error('Invalid diagnostic committed input selection.');
  }
  const bytes = readCommittedAuthorityFile(root, commit, path as string, 65_536, remainingTimeMs, commit.length === 64 ? 64 : 40, true);
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const ATTEMPT_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const MAX_BYTES = 256 * 1024;
// Leave space for a bounded terminal without dropping immutable phase metadata.
const TERMINAL_RESERVE_BYTES = 1024;
const MAX_FILES = 4096;
const MAX_DIRECTORY_READ_BYTES = 4 * 1024 * 1024;
const ROUTES = new Set(['manual', 'UserPromptSubmit', 'PostToolUse', 'native', 'ci-review', 'ci-outcome']);
const STATES = new Set(['completed', 'error', 'incomplete', 'unsupported', 'deduplicated', 'unchanged', 'queued', 'cancelled', 'missing']);
export const measurementDigest = (value: unknown): string => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const within = (root: string, target: string) => { const r = relative(root, target); return r === '' || (r !== '..' && !r.startsWith(`..${sep}`) && !isAbsolute(r)); };
export function warnMeasurementGap(message = 'AGK measurement gap: diagnostic recording unavailable.\n'): void {
  // A synchronous descriptor write contains closed-pipe errors without queuing
  // an unhandled stream error. Hosts without a usable descriptor may lose it.
  try { writeSync(process.stderr.fd, message); } catch { /* Warning delivery is optional too. */ }
}
const noop = Object.freeze({ request() {}, finish() {}, id: null });
// Count every directory entry before matching record names. The iterator
// stops on the first overflow and closes its handle on success or failure.
function* measurementDirectoryEntries(path: string, maximumEntries: number) {
  const handle = opendirSync(path, { bufferSize: 32 });
  try {
    let count = 0;
    for (let entry = handle.readSync(); entry; entry = handle.readSync()) {
      if (++count > maximumEntries) throw new Error('Measurement directory entry limit exceeded.');
      yield entry.name;
    }
  } finally { handle.closeSync(); }
}
export function resolveMeasurementWorkingRoot(value: unknown = process.cwd()): string {
  if (typeof value !== 'string' || !value) throw new Error('Invalid diagnostic working root.');
  const canonical = realpathSync(value);
  // Resolve an actual Git worktree before checking containment or hashing its
  // identity. Non-Git working roots remain supported; an unresolved Git marker
  // is a gap, never permission to fall back to a narrower subdirectory.
  for (let ancestor = canonical; ; ancestor = dirname(ancestor)) {
    try {
      lstatSync(join(ancestor, '.git'));
      // Ambient repository/config selectors must not replace the marker found
      // above. Keep this isolation local to optional diagnostics.
      const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^GIT_/i.test(name)));
      const selected = execFileSync('git', ['rev-parse', '--show-toplevel'], {
        cwd: ancestor, env, encoding: 'utf8', timeout: 5000, maxBuffer: 4096, stdio: ['ignore', 'pipe', 'pipe'],
      }).trim();
      if (realpathSync(selected) !== ancestor) throw new Error('Diagnostic Git root does not match its worktree marker.');
      return ancestor;
    }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (dirname(ancestor) === ancestor) return canonical;
  }
}
function directory(path: string | undefined, root?: string, remainingWrites = 1) {
  // POSIX mode bits cannot establish directory privacy on Windows. Until a
  // Windows ACL boundary is supported, refuse capture/export before any I/O.
  if (process.platform === 'win32') throw new Error('Measurement capture and directory export are unsupported on Windows.');
  if (typeof path !== 'string' || !isAbsolute(path)) throw new Error('Measurement directory must be absolute.');
  path = resolveDiagnosticPath(path);
  const canonical = realpathSync(path);
  const stat = lstatSync(path);
  if (canonical !== resolve(path) || !stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o777) !== 0o700) throw new Error('Measurement directory must be canonical and private (0700).');
  if (typeof process.geteuid !== 'function' || stat.uid !== process.geteuid()) throw new Error('Measurement directory must be owned by the current effective user.');
  if (root && within(realpathSync(root), canonical)) throw new Error('Measurement directory must be outside the reviewed worktree.');
  if (remainingWrites) for (const _ of measurementDirectoryEntries(canonical, MAX_FILES - remainingWrites)) { /* leave room for every remaining phase */ }
  return canonical;
}
function put(dir: string, record: MeasurementRecord) {
  const bytes = Buffer.from(`${JSON.stringify(record)}\n`);
  const limit = record.phase === 'terminal' ? MAX_BYTES : MAX_BYTES - TERMINAL_RESERVE_BYTES;
  if (bytes.length > limit) throw new Error('Measurement record exceeds limit.');
  // Check the entire wrapper, not only caller fields, against the reader depth.
  parseMeasurementJson(bytes.toString('utf8'));
  // Exclusive files preserve previous observations; readers treat torn writes as gaps.
  writeFileSync(join(dir, `${record.attemptId}.${record.phase}.json`), bytes, { mode: 0o600, flag: 'wx' });
}
export function readMeasurementJson(path: string): unknown {
  return parseMeasurementJson(readDiagnosticText(path, MAX_BYTES));
}
export function parseMeasurementJson(source: unknown): unknown {
  if (typeof source !== 'string' || Buffer.byteLength(source) > MAX_BYTES) throw new Error('Measurement JSON exceeds limit.');
  rejectDuplicateJsonKeys(source, 'measurement', { maxDepth: 32 });
  return JSON.parse(source);
}
function snapshotJson<T>(value: T): T {
  const serialized = JSON.stringify(value);
  if (typeof serialized !== 'string') throw new Error('Measurement value is not JSON serializable.');
  return parseMeasurementJson(serialized) as T;
}
function runtime() {
  // Identify the complete installed emitted runtime, including collector helpers
  // and every route adapter. A package version or this module alone is insufficient.
  const root = new URL('.', import.meta.url);
  const hash = createHash('sha256').update('agk-collector-runtime-v1\n');
  let entries = 0; let totalBytes = 0;
  const consume = (url: URL) => {
    const leaf = lstatSync(url);
    if (!leaf.isFile() || leaf.isSymbolicLink() || leaf.size > MAX_BYTES) throw new Error('Invalid collector runtime file.');
    const fd = openSync(url, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.dev !== leaf.dev || stat.ino !== leaf.ino || stat.size > MAX_BYTES) throw new Error('Invalid collector runtime file.');
      const bytes = Buffer.alloc(Math.min(MAX_BYTES + 1, stat.size + 1)); let length = 0;
      while (length < bytes.length) { const count = readSync(fd, bytes, length, bytes.length - length, null); if (!count) break; length += count; }
      totalBytes += length;
      if (length > stat.size || length > MAX_BYTES || totalBytes > 8 * 1024 * 1024) throw new Error('Collector runtime byte limit exceeded.');
      return bytes.subarray(0, length);
    } finally { closeSync(fd); }
  };
  const include = (name: string, bytes: Buffer) => hash.update(JSON.stringify([name, createHash('sha256').update(bytes).digest('hex')]) + '\n');
  const walk = (url: URL, prefix: string, depth: number) => {
    if (depth > 8) throw new Error('Collector runtime depth limit exceeded.');
    const handle = opendirSync(url, { bufferSize: 32 }); const names: string[] = [];
    try { for (let entry = handle.readSync(); entry; entry = handle.readSync()) { if (++entries > MAX_FILES) throw new Error('Collector runtime entry limit exceeded.'); names.push(entry.name); } }
    finally { handle.closeSync(); }
    for (const name of names.sort()) {
      const target = new URL(encodeURIComponent(name), url); const path = prefix + name; const stat = lstatSync(target);
      if (stat.isSymbolicLink()) throw new Error('Invalid collector runtime entry.');
      if (stat.isDirectory()) walk(new URL(encodeURIComponent(name) + '/', url), path + '/', depth + 1);
      else if (name.endsWith('.mjs') || name.endsWith('.mts')) include(path, consume(target));
    }
  };
  const packageBytes = consume(new URL('../package.json', root));
  const pkg = JSON.parse(packageBytes.toString('utf8'));
  include('../package.json', packageBytes); walk(root, '', 0);
  return { package: pkg.name, version: pkg.version, collectorSha256: hash.digest('hex') };
}
/** Optional diagnostics only. Errors never become review or acceptance decisions.
 * @param {{route?: string, cwd?: string, directory?: string, changeId?: string, sessionId?: unknown, correlation?: string, context?: object}} [options]
 * @returns {MeasurementAttempt}
 */
export function beginMeasurement(options: MeasurementOptions = {}): MeasurementAttempt {
  try {
    if (!options || typeof options !== 'object') throw new Error('Invalid measurement options.');
    const { route, cwd = process.cwd(), directory: selected = process.env.AGK_MEASUREMENT_DIR,
      changeId = process.env.AGK_MEASUREMENT_CHANGE_ID, sessionId, correlation, context = {} } = options;
    if (!selected) return noop;
    if (!route || !ROUTES.has(route)) throw new Error('Unknown measurement route.');
    if (changeId && (typeof changeId !== 'string' || changeId.length > 200)) throw new Error('Invalid change identity.');
    const root = resolveMeasurementWorkingRoot(cwd);
    const dir = directory(selected, root, 3);
    const start = { version: 1, kind: 'agk-diagnostic', attemptId: randomUUID(), phase: 'start', route, startedAt: new Date().toISOString(), runtime: runtime(),
      repositoryId: measurementDigest(root), changeId: changeId || null,
      sessionId: sessionId ? measurementDigest(sessionId) : null, correlation: correlation || null, context };
    const snapshot = snapshotJson(start);
    put(dir, snapshot);
    return recorder(dir, snapshot, root);
  } catch { warnMeasurementGap(); return noop; }
}
function recorder(dir: string, start: RecordView, root: string): MeasurementAttempt {
  const envelope: RecordView = { ...Object.fromEntries(MEASUREMENT_ENVELOPE_FIELDS.filter(field => Object.hasOwn(start, field)).map(field => [field, start[field]])),
    version: start.version, kind: start.kind, attemptId: start.attemptId, route: start.route, startedAt: start.startedAt, phase: 'start' };
  let request = start.request || null;
  const terminal = (completedAt: string, fields: MeasurementFields): RecordView => ({ ...envelope, phase: 'terminal', completedAt,
    elapsedMs: Date.parse(completedAt) - Date.parse(start.startedAt), request, ...fields });
  const gap = (completedAt: string, reason: string) => terminal(completedAt, { state: 'incomplete', decision: null, execution: null,
    feedback: { publication: 'unknown', delivery: 'unknown', response: 'unknown' }, observation: { gap: reason } });
  // Legacy near-limit envelopes cannot be shrunk without contradicting prior phases.
  // Refuse resumption instead of returning a recorder unable to retain its terminal.
  // Budget the longest fixed gap marker, extended ISO date and maximum signed
  // Date-range difference, rather than today's shorter values.
  const fallback = JSON.stringify({ ...gap(new Date().toISOString(), 'invalid-record-payload'),
    completedAt: new Date(8.64e15).toISOString(), elapsedMs: -2 * 8.64e15 });
  if (Buffer.byteLength(fallback) + 1 > MAX_BYTES) throw new Error('Measurement terminal reserve unavailable.');
  parseMeasurementJson(fallback);
  let finished = false;
  let preparing = false;
  let requestRepositoryGap = false;
  let prepared = start.phase === 'prepared' || Boolean(start.request);
  directory(dir, root, prepared ? 1 : 2);
  return { id: start.attemptId,
    request(value, scope = {}, transportPrompt) {
      if (finished || prepared || preparing) return;
      preparing = true;
      try {
        const selectedRepositoryRoot = value.repositoryRoot;
        let metadataRoot: string | undefined;
        if (selectedRepositoryRoot !== undefined) {
          try {
            metadataRoot = resolveMeasurementWorkingRoot(selectedRepositoryRoot);
            if (measurementDigest(metadataRoot) !== envelope.repositoryId) throw new Error('Request repository differs from attempt.');
            requestRepositoryGap = false;
          } catch (error) { requestRepositoryGap = true; throw error; }
        } else if (requestRepositoryGap) { throw new Error('Request repository remains unverified.'); }
        const selectedPrompt = value.prompt;
        const selectedSchema = value.schema;
        const selectedTransportPrompt = transportPrompt === undefined ? selectedPrompt : transportPrompt;
        const candidate: CapturedRequest = { requestId: value.requestId, reviewedRevision: value.reviewedRevision,
          promptSha256: typeof selectedTransportPrompt === 'string' ? measurementDigest(selectedTransportPrompt) : null,
          selectedPromptSha256: typeof selectedPrompt === 'string' ? measurementDigest(selectedPrompt) : null,
          schemaSha256: selectedSchema !== undefined ? measurementDigest(selectedSchema) : null,
          authoritySet: value.authoritySet || null, requestedReviewer: value.reviewer, scope };
        if (metadataRoot) {
          try {
            const deadline = performance.now() + 10_000;
            const remainingTimeMs = () => deadline - performance.now();
            const config = measurementGitSnapshot(metadataRoot, candidate.reviewedRevision, '.codex/gatekeeper/config.json', remainingTimeMs);
            const selected = JSON.parse(config.bytes.toString('utf8')) as Record<string, string>;
            candidate.selectedInputDigests = { configSha256: config.sha256 };
            for (const key of ['validationPath', 'reviewerConfigPath']) {
              if (selected[key]) candidate.selectedInputDigests![key] = measurementGitSnapshot(metadataRoot, candidate.reviewedRevision, selected[key], remainingTimeMs).sha256;
            }
          } catch { candidate.selectedInputDigests = { gap: 'unavailable' }; }
        }
        const snapshot = snapshotJson(candidate);
        if (finished) return;
        directory(dir, root, 2);
        put(dir, { ...start, phase: 'prepared', request: snapshot });
        request = snapshot;
        prepared = true;
      } catch { warnMeasurementGap(); }
      finally { preparing = false; }
    },
    finish(value = {}) {
      if (finished) return;
      finished = true;
      try {
        if (requestRepositoryGap) {
          directory(dir, root);
          put(dir, gap(new Date().toISOString(), 'repository-mismatch'));
          return;
        }
        const { state = 'completed', decision = null, execution = null, publication = 'unknown', observation = {} } = value;
        if (!STATES.has(state)) throw new Error('Unknown measurement state.');
        const completedAt = new Date().toISOString();
        let record: MeasurementRecord;
        try {
          // Snapshot once: caller toJSON/getters cannot change the persisted payload
          // between a successful size check and its write.
          const serialized = JSON.stringify(terminal(completedAt, { state, decision, execution,
            feedback: { publication, delivery: 'unknown', response: 'unknown' }, observation }));
          record = Buffer.byteLength(serialized) + 1 > MAX_BYTES ? gap(completedAt, 'record-too-large') : parseMeasurementJson(serialized) as MeasurementRecord;
        } catch { record = gap(completedAt, 'invalid-record-payload'); }
        // The file limit also applies when completing older attempts.
        directory(dir, root);
        put(dir, record);
      } catch { warnMeasurementGap(); }
    }
  };
}
/** Native prepare/validate are separate host calls; correlate by private request location and request ID. */
export function resumeNativeMeasurement(requestPath: string, request: MeasurementRequest, selected = process.env.AGK_MEASUREMENT_DIR): MeasurementAttempt {
  if (!selected) return noop;
  try {
    const root = resolveMeasurementWorkingRoot(request.repositoryRoot);
    const dir = directory(selected, root);
    const correlation = measurementDigest(resolve(requestPath));
    const records = loadMeasurementDirectory(dir, root).records as RecordView[];
    // A torn/oversized terminal is still an exclusive terminal file. Do not
    // select that attempt merely because parsing omitted it from the loader.
    const unfinished = (id: string) => {
      try { readDiagnosticText(join(dir, `${id}.terminal.json`), MAX_BYTES); return false; }
      catch (error) { return (error as NodeJS.ErrnoException).code === 'ENOENT'; }
    };
    const collectorSha256 = runtime().collectorSha256;
    const starts = records.filter(r => (r.runtime as { collectorSha256?: unknown } | null)?.collectorSha256 === collectorSha256 && r.repositoryId === measurementDigest(root) && r.phase === 'prepared' && r.route === 'native' && r.request?.requestId === request.requestId && r.correlation === correlation && unfinished(r.attemptId));
    starts.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
    const start = starts.find(candidate => {
      try {
        const phases = records.filter(r => r.attemptId === candidate.attemptId);
        if (!phases.some(r => r.phase === 'start')) return false;
        validateMeasurementPhases(phases); return true;
      }
      catch { return false; /* a corrupt candidate must not shadow a valid older one */ }
    });
    if (!start) throw new Error('Native preparation observation missing or already completed.');
    const result = recorder(dir, start, root);
    return result;
  } catch { warnMeasurementGap(); return noop; }
}
// Accept explicit ISO timezone timestamps at millisecond or exact-second precision.
// Calendar round trips reject impossible dates without changing valid source text.
function canonicalTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = value.match(/^((?:\d{4}|[+-]\d{6})-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?)(?:Z|[+-]\d{2}:\d{2})$/);
  if (!match || !Number.isFinite(Date.parse(value))) return false;
  const calendar = Date.parse(`${match[1]}Z`);
  if (!Number.isFinite(calendar)) return false;
  const canonical = new Date(calendar).toISOString().slice(0, -1);
  return match[1] === canonical || match[1] === canonical.replace(/\.000$/, '');
}
export function validateMeasurementRecord(value: unknown): MeasurementRecord {
  const record = value as RecordView;
  if (!record || record.version !== 1 || record.kind !== 'agk-diagnostic' || typeof record.attemptId !== 'string' || !ATTEMPT_ID.test(record.attemptId) ||
      !ROUTES.has(record.route) || !['start', 'prepared', 'terminal'].includes(record.phase) || !canonicalTimestamp(record.startedAt) ||
      (record.phase === 'terminal' && (!STATES.has(record.state as string) || !canonicalTimestamp(record.completedAt)))) throw new Error('Invalid diagnostic record.');
  return record;
}
export function loadMeasurementDirectory(dir: string, cwd?: unknown) {
  dir = directory(dir, resolveMeasurementWorkingRoot(cwd), 0);
  const names = [...measurementDirectoryEntries(dir, MAX_FILES)].filter(n => /^[0-9a-f-]{36}\.(start|prepared|terminal)\.json$/.test(n)).sort();
  const records: MeasurementRecord[] = []; let gaps = 0; let readBytes = 0;
  const budgetExceeded = new Error('Measurement directory read byte limit exceeded.');
  const accountReadBytes = (count: number) => {
    readBytes += count;
    if (readBytes > MAX_DIRECTORY_READ_BYTES) throw budgetExceeded;
  };
  for (const name of names) {
    let source: string;
    try { source = readDiagnosticText(join(dir, name), MAX_BYTES, accountReadBytes); }
    catch (error) {
      // Invalid UTF-8, malformed JSON and partial I/O failures consume their
      // actual read bytes too. Budget overflow refuses the complete history.
      if (error === budgetExceeded) throw error;
      gaps++; continue;
    }
    try { const r = validateMeasurementRecord(parseMeasurementJson(source)); if (`${r.attemptId}.${r.phase}.json` !== name) throw new Error('File identity mismatch.'); records.push(r); }
    catch { gaps++; }
  }
  return { version: 1, records, gaps };
}
/** Whitelist only: no task, prompt, diff, finding text, model/settings or authority names leave private storage. */
export function redactMeasurement(value: MeasurementRecord) {
  const record = value as RecordView;
  validateMeasurementRecord(record);
  const sha256 = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v) ? v : null;
  const gitSha = (v: unknown) => typeof v === 'string' && /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v) ? v : null;
  const runtimeView = record.runtime as { package?: unknown; version?: unknown; collectorSha256?: unknown } | null | undefined;
  const runtimeIdentity = {
    package: runtimeView?.package === '@flair-agency/architecture-gatekeeper' ? runtimeView.package : null,
    version: typeof runtimeView?.version === 'string' && runtimeView.version.length <= 100 &&
      /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?(?:\+[0-9A-Za-z]+(?:[.-][0-9A-Za-z]+)*)?$/.test(runtimeView.version) ? runtimeView.version : null,
    collectorSha256: typeof runtimeView?.collectorSha256 === 'string' && /^[a-f0-9]{64}$/.test(runtimeView.collectorSha256) ? runtimeView.collectorSha256 : null,
  };
  const decisionView = record.decision as DecisionView | null | undefined;
  const decision = ['PASS', 'BLOCK', 'OWNER_DECISION'].includes(decisionView?.decision as string) ? decisionView!.decision : null;
  const count = Array.isArray(decisionView?.findings) ? decisionView.findings.length : null;
  const observation: MeasurementFields = {};
  for (const key of ['reviewJob', 'reportJob', 'acceptJob', 'policyJob']) {
    if (['success', 'failure', 'cancelled', 'skipped'].includes(record.observation?.[key] as string)) observation[key] = record.observation![key];
  }
  const ci = (record.context?.ci || {}) as MeasurementFields;
  const numeric = (v: unknown) => typeof v === 'string' && /^[1-9][0-9]{0,19}$/.test(v) ? v : null;
  const ciContext = Object.keys(ci).length ? { repositoryId: typeof ci.repository === 'string' ? measurementDigest(ci.repository) : null,
    pr: numeric(ci.pr), runId: numeric(ci.runId), runAttempt: numeric(ci.runAttempt), workflowSha: gitSha(ci.workflowSha),
    baseSha: gitSha(ci.baseSha), headSha: gitSha(ci.headSha), reviewedSha: gitSha(ci.reviewedSha), job: ['review', 'measurement'].includes(ci.job as string) ? ci.job : null } : null;
  return { version: 1, kind: 'agk-diagnostic', attemptId: record.attemptId, phase: record.phase, route: record.route, runtime: runtimeIdentity,
    startedAt: record.startedAt, ...(record.phase === 'terminal' ? { completedAt: record.completedAt, state: record.state } : {}),
    changeId: record.changeId ? measurementDigest(record.changeId) : null, repositoryId: sha256(record.repositoryId),
    requestId: sha256(record.request?.requestId), promptSha256: sha256(record.request?.promptSha256), schemaSha256: sha256(record.request?.schemaSha256), authorityProvenanceSha256: sha256(record.request?.scope?.authorityProvenanceSha256), policySha256: sha256(record.request?.scope?.policySha256), reviewedRevision: gitSha(record.request?.reviewedRevision), snapshotSha256: sha256(record.request?.scope?.snapshotSha256), scopeKind: ['proposed-task', 'tracked-working-tree', 'ci-merge-revision'].includes(record.request?.scope?.kind as string) ? record.request!.scope.kind : null,
    decision, findingCount: count, ci: ciContext, observation, feedback: { publication: record.feedback?.publication === 'returned-to-caller' ? 'returned-to-caller' : 'unknown', delivery: 'unknown', response: 'unknown' } };
}

export function resumeMeasurement(attemptId: string, selected: string | undefined, cwd?: unknown): MeasurementAttempt {
  try {
    const root = resolveMeasurementWorkingRoot(cwd);
    const dir = directory(selected, root);
    if (!ATTEMPT_ID.test(attemptId)) throw new Error('Invalid attempt identity.');
    try { readDiagnosticText(join(dir, `${attemptId}.terminal.json`), MAX_BYTES); throw new Error('Attempt already completed.'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const start = validateMeasurementRecord(readMeasurementJson(join(dir, `${attemptId}.start.json`))) as RecordView;
    if (start.attemptId !== attemptId || start.phase !== 'start') throw new Error('Mismatched start observation.');
    if (start.repositoryId !== measurementDigest(root)) throw new Error('Recorded repository differs from reviewed root.');
    if ((start.runtime as { collectorSha256?: unknown } | null)?.collectorSha256 !== runtime().collectorSha256) throw new Error('Collector runtime differs from start observation.');
    const preparedPath = join(dir, `${attemptId}.prepared.json`);
    let prepared: RecordView | undefined;
    try { prepared = validateMeasurementRecord(readMeasurementJson(preparedPath)) as RecordView; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (prepared) {
      if (prepared.attemptId !== attemptId || prepared.phase !== 'prepared') throw new Error('Mismatched prepared observation.');
      validateMeasurementPhases([start, prepared]);
    }
    return recorder(dir, prepared || start, root);
  } catch { warnMeasurementGap(); return noop; }
}
