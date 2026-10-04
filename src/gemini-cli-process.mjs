/** Internal POSIX supervisor for the pinned Gemini CLI execution profile. */
import { spawn } from 'node:child_process';
import { chmodSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, join, resolve } from 'node:path';

const VERSION = '0.62.0';
const MAX_TIMEOUT = 60 * 60 * 1000;
const GEMINI_CLI_STDIN_LIMIT = 8 * 1024 * 1024;

function validate(options) {
  if (process.platform === 'win32') throw new Error('Gemini CLI process supervisor supports POSIX platforms only.');
  const { cliEntrypoint, workspaceDirectory, privateParentDirectory, prompt, model, thinkingBudget,
    project, region, proxyUrl, timeoutMs, maxPromptBytes, maxStdoutBytes, maxStderrBytes } = options ?? {};
  for (const [value, label] of [[cliEntrypoint, 'CLI entrypoint'], [workspaceDirectory, 'workspace directory'], [privateParentDirectory, 'private parent directory']]) {
    if (typeof value !== 'string' || !value || !value.startsWith('/')) throw new Error(`Gemini CLI ${label} must be an absolute path.`);
  }
  const promptLimit = positive(maxPromptBytes, 'prompt');
  if (promptLimit > GEMINI_CLI_STDIN_LIMIT) throw new Error('Gemini CLI prompt byte limit exceeds the CLI stdin limit of 8 MiB.');
  if (typeof prompt !== 'string' || !prompt || Buffer.byteLength(prompt, 'utf8') > promptLimit || Buffer.from(prompt, 'utf8').toString('utf8') !== prompt) throw new Error('Gemini CLI prompt is empty, invalid UTF-8 text, or exceeds its configured byte limit.');
  if (typeof model !== 'string' || !/^[A-Za-z0-9._-]+$/.test(model)) throw new Error('Gemini CLI model is invalid.');
  if (!Number.isSafeInteger(thinkingBudget) || thinkingBudget < 0) throw new Error('Gemini CLI thinking budget must be a nonnegative safe integer.');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_TIMEOUT) throw new Error('Gemini CLI timeout is invalid.');
  positive(maxStdoutBytes, 'stdout'); positive(maxStderrBytes, 'stderr');
  if (typeof project !== 'string' || !/^[A-Za-z0-9._:-]+$/.test(project)) throw new Error('Gemini CLI project is required and must be valid.');
  if (typeof region !== 'string' || !/^[A-Za-z0-9-]+$/.test(region)) throw new Error('Gemini CLI region is required and must be valid.');
  let endpoint;
  try { endpoint = new URL(proxyUrl); } catch { throw new Error('Gemini CLI proxy URL must be an HTTP loopback URL.'); }
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || !endpoint.port || endpoint.username || endpoint.password || endpoint.pathname !== '/' || endpoint.search || endpoint.hash) throw new Error('Gemini CLI proxy URL must be an HTTP loopback URL.');
  return options;
}
function positive(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`Gemini CLI ${label} byte limit must be an explicit positive safe integer.`);
  return value;
}

function rejectWorkspaceControls(workspaceDirectory) {
  let workspace;
  try {
    workspace = realpathSync(workspaceDirectory);
  } catch {
    throw new Error('Gemini CLI workspace must resolve to an existing directory.');
  }
  try {
    if (!lstatSync(workspace).isDirectory()) throw new Error('Gemini CLI workspace must be a directory.');
  } catch (error) {
    if (error instanceof Error && error.message === 'Gemini CLI workspace must be a directory.') throw error;
    throw new Error('Gemini CLI workspace must resolve to an existing directory.');
  }

  // Gemini CLI 0.62.0 loads workspace settings from cwd, .env files while
  // walking every parent, and contextual instruction files up to a boundary.
  // Check canonical ancestors and use lstat so dangling control symlinks fail
  // closed too. The caller must keep this tree stable until child exit.
  let directory = workspace;
  while (true) {
    for (const name of ['.gemini', '.agents', '.env', 'GEMINI.md']) {
      try {
        lstatSync(join(directory, name));
        throw new Error(`Gemini CLI workspace contains a forbidden control path: ${join(directory, name)}.`);
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        if (error instanceof Error && error.message.startsWith('Gemini CLI workspace contains a forbidden control path:')) throw error;
        throw new Error(`Gemini CLI workspace control path could not be checked: ${join(directory, name)}.`);
      }
    }
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }

  // Gemini CLI 0.62.0 JIT memory discovery starts at a tool-accessed path's
  // directory and searches upward to the workspace boundary. Accessing a file
  // under src can therefore load src/GEMINI.md even when startup discovery
  // found no workspace-root instructions. Ancestor checks alone miss these
  // nested controls. Materialized review workspaces contain bounded ordinal
  // evidence files; reject controls anywhere in that tree and fail closed on
  // symlinks rather than following them.
  const forbiddenNames = new Set(['.gemini', '.agents', '.env', 'gemini.md']);
  const pending = [workspace];
  while (pending.length) {
    const current = pending.pop();
    let entries;
    try { entries = readdirSync(current, { withFileTypes: true }); }
    catch { throw new Error(`Gemini CLI workspace descendants could not be checked: ${current}.`); }
    for (const entry of entries) {
      const child = join(current, entry.name);
      // Case-fold names so a case-insensitive filesystem cannot hide controls.
      if (forbiddenNames.has(entry.name.toLowerCase())) {
        throw new Error(`Gemini CLI workspace contains a forbidden control path: ${child}.`);
      }
      let stat;
      try { stat = lstatSync(child); }
      catch { throw new Error(`Gemini CLI workspace descendant could not be checked: ${child}.`); }
      if (stat.isSymbolicLink()) throw new Error(`Gemini CLI workspace contains an unsupported symbolic link: ${child}.`);
      if (stat.isDirectory()) pending.push(child);
    }
  }
  return workspace;
}

function controlledEnv(home, options) {
  const nodeDir = dirname(process.execPath);
  const env = {
    PATH: [...new Set([nodeDir, '/usr/bin', '/bin'])].join(delimiter),
    HOME: home,
    TMPDIR: home,
    CI: 'true',
    NO_COLOR: '1',
    GOOGLE_GENAI_USE_VERTEXAI: 'true',
    GOOGLE_API_KEY: 'GEMINI_CLI_VERTEX_MODE_NO_API_KEY',
    GOOGLE_VERTEX_BASE_URL: options.proxyUrl,
    GOOGLE_GENAI_API_VERSION: 'v1',
    GEMINI_CLI_TRUST_WORKSPACE: 'true',
    GEMINI_CLI_SYSTEM_SETTINGS_PATH: join(home, 'system-settings-absent.json'),
    GEMINI_CLI_SYSTEM_DEFAULTS_PATH: join(home, 'system-defaults-absent.json'),
  };
  if (options.project !== undefined) env.GOOGLE_CLOUD_PROJECT = options.project;
  if (options.region !== undefined) env.GOOGLE_CLOUD_LOCATION = options.region;
  return env;
}

function settings(options) {
  return {
    tools: { core: ['read_file', 'list_directory', 'glob', 'grep_search'] },
    context: { fileFiltering: { respectGitIgnore: false, respectGeminiIgnore: false } },
    hooksConfig: { enabled: false },
    skills: { enabled: false },
    telemetry: { enabled: false },
    general: { enableAutoUpdate: false },
    security: { auth: { selectedType: 'vertex-ai' } },
    modelConfigs: {
      customOverrides: [{ match: { model: options.model }, modelConfig: {
        generateContentConfig: { thinkingConfig: { thinkingBudget: options.thinkingBudget, includeThoughts: false } },
      } }],
    },
  };
}

function spawnBounded(executable, args, { cwd, env, deadline, maxStdoutBytes, maxStderrBytes, signal, input }) {
  return new Promise((resolveResult, reject) => {
    if (signal?.aborted) { reject(new Error('Gemini CLI execution cancelled before spawn.')); return; }
    if (Date.now() >= deadline) { reject(new Error('Gemini CLI execution timed out before spawn.')); return; }
    const child = spawn(executable, args, { cwd, env, detached: true, stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'] });
    const stdoutChunks = []; const stderrChunks = []; let stdoutBytes = 0; let stderrBytes = 0;
    let timedOut = false; let cancelled = false; let overflow = false; let settled = false; let stdinError = null;
    const killGroup = () => { if (child.pid) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } };
    const finishError = error => { if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort); killGroup(); reject(error); };
    const abort = () => { cancelled = true; killGroup(); };
    const remaining = Math.max(1, deadline - Date.now());
    const timer = setTimeout(() => { timedOut = true; killGroup(); }, remaining);
    signal?.addEventListener('abort', abort, { once: true });
    child.on('error', error => finishError(new Error(`Gemini CLI could not start: ${error.message}`)));
    child.stdout.on('data', chunk => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maxStdoutBytes) { overflow = true; killGroup(); return; }
      stdoutChunks.push(chunk);
    });
    child.stderr.on('data', chunk => {
      stderrBytes += chunk.length;
      if (stderrBytes > maxStderrBytes) { overflow = true; killGroup(); return; }
      stderrChunks.push(chunk);
    });
    if (input !== undefined) {
      child.stdin.on('error', error => { stdinError = error; });
      child.stdin.end(input);
    }
    child.on('close', (exitCode, childSignal) => {
      if (settled) return; settled = true; clearTimeout(timer); signal?.removeEventListener('abort', abort);
      killGroup();
      if (overflow) { reject(new Error('Gemini CLI output exceeded its configured size limit.')); return; }
      if (input !== undefined && stdinError) { reject(new Error('Gemini CLI closed prompt stdin before accepting the complete prompt.')); return; }
      try {
        const decoder = new TextDecoder('utf-8', { fatal: true });
        resolveResult({ exitCode, stdout: decoder.decode(Buffer.concat(stdoutChunks)), stderr: decoder.decode(Buffer.concat(stderrChunks)), signal: childSignal, timedOut, cancelled });
      } catch { reject(new Error('Gemini CLI output was not valid UTF-8.')); }
    });
  });
}

/**
 * Run Gemini CLI 0.62.0 under a private HOME and bounded POSIX process group.
 * Caller must verify CLI integrity, protect the selected workspace/paths, and
 * validate successful response text with gemini-cli-response.mjs.
 * This provides POSIX process-group cleanup, not kernel-enforced host confinement
 * or an absolute guarantee that the operating system killed every descendant.
 * The caller owns private-parent integrity and protected-request preflight;
 * the version probe checks the reported version string only.
 */
export async function runGeminiCliProcess(options) {
  validate(options);
  const start = Date.now(); const deadline = start + options.timeoutMs;
  if (options.signal?.aborted) throw new Error('Gemini CLI execution cancelled before setup.');
  let home;
  try {
    const workspaceDirectory = rejectWorkspaceControls(options.workspaceDirectory);
    home = mkdtempSync(join(resolve(options.privateParentDirectory), 'agk-gemini-home-'));
    chmodSync(home, 0o700);
    const gemini = join(home, '.gemini'); mkdirSync(gemini, { mode: 0o700 }); chmodSync(gemini, 0o700);
    writeFileSync(join(gemini, 'settings.json'), JSON.stringify(settings(options)), { mode: 0o600, flag: 'wx' });
    const env = controlledEnv(home, options);
    const versionResult = await spawnBounded(process.execPath, [options.cliEntrypoint, '--version'], {
      cwd: workspaceDirectory, env, deadline, maxStdoutBytes: options.maxStdoutBytes,
      maxStderrBytes: options.maxStderrBytes, signal: options.signal,
    });
    if (versionResult.timedOut || versionResult.cancelled || versionResult.signal || versionResult.exitCode !== 0 || versionResult.stdout.trim() !== VERSION) {
      throw new Error('Gemini CLI version probe failed or did not report the pinned version 0.62.0.');
    }
    const result = await spawnBounded(process.execPath, [options.cliEntrypoint, `--model=${options.model}`, '--output-format', 'json'], {
      cwd: workspaceDirectory, env, deadline, maxStdoutBytes: options.maxStdoutBytes,
      maxStderrBytes: options.maxStderrBytes, signal: options.signal, input: Buffer.from(options.prompt, 'utf8'),
    });
    return result;
  } finally {
    if (home) rmSync(home, { recursive: true, force: true });
  }
}
