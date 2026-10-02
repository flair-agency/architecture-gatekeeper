#!/usr/bin/env node
/**
 * src/gemini-ci-runner.mjs
 * Standalone review runner for Gemini provider in CI and local workflows.
 * Zero external npm dependencies: uses Node.js standard library and native fetch.
 */
import { constants, existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runGeminiReviewer } from './gemini-transport.mjs';
import { validateJsonSchema } from './json-schema.mjs';
import { preflightReviewRequest, validateReviewResponse } from './review-contract.mjs';
import { appendGitHubOutput } from './runner-temp-path.mjs';

/**
 * Resolves a file path relative to an authorized root directory using lexical and existing-ancestor realpath checks.
 * Rejects null bytes and verifies that the lexical path does not traverse outside
 * baseDir or recognized temporary directories.
 * @param {string} userPath
 * @param {string} baseDir
 * @returns {string}
 */
export function resolveSafePath(userPath, baseDir) {
  if (typeof userPath !== 'string' || !userPath.trim()) {
    throw new Error('Path must be a non-empty string.');
  }
  if (userPath.includes('\0')) {
    throw new Error('Path contains forbidden null bytes.');
  }
  const root = resolve(baseDir);
  const resolved = isAbsolute(userPath) ? resolve(userPath) : resolve(root, userPath);
  
  // Verify containment within baseDir
  const relBase = relative(root, resolved);
  const inBase = !relBase.startsWith('..') && !isAbsolute(relBase);

  // If outside baseDir, verify if it is safely contained within runner temp or OS temp
  if (!inBase) {
    const authorizedTempRoots = [
      process.env.RUNNER_TEMP ? resolve(process.env.RUNNER_TEMP) : null,
      tmpdir() ? resolve(tmpdir()) : null,
      '/tmp',
      '/private/tmp',
      '/var/folders',
      '/private/var/folders',
    ].filter(Boolean);

    const inTemp = authorizedTempRoots.some((tempRoot) => {
      const relTemp = relative(tempRoot, resolved);
      return !relTemp.startsWith('..') && !isAbsolute(relTemp);
    });

    if (!inTemp) {
      throw new Error(`Path traversal denied: path "${userPath}" escapes authorized root directories.`);
    }
  }

  // A lexical in-root path must not escape through a symlink, including output parents.
  let ancestor = resolved;
  while (true) {
    try { lstatSync(ancestor); break; }
    catch (error) {
      if (error.code !== 'ENOENT' || dirname(ancestor) === ancestor) throw error;
      ancestor = dirname(ancestor);
    }
  }
  let physicalAncestor;
  try { physicalAncestor = realpathSync(ancestor); }
  catch { throw new Error('Path traversal denied: dangling or inaccessible path ancestor.'); }
  const roots = [root, process.env.RUNNER_TEMP, tmpdir(), '/tmp', '/private/tmp', '/var/folders', '/private/var/folders'].filter(Boolean);
  if (!roots.some(candidate => {
    if (!existsSync(candidate)) return false;
    const rel = relative(realpathSync(candidate), physicalAncestor);
    return rel !== '..' && !rel.startsWith('../') && !isAbsolute(rel);
  })) throw new Error('Path traversal denied: symlink escapes authorized root directories.');
  return resolved;
}

/**
 * Parses CLI arguments into an options object.
 * @param {string[]} argv
 * @returns {Record<string, string>}
 */
export function parseArgs(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) {
        options[key] = argv[++i];
      } else {
        options[key] = 'true';
      }
    }
  }
  return options;
}

/**
 * Builds or loads a complete review request.
 * @param {Record<string, string>} options
 * @param {string} root
 * @returns {object}
 */
export function resolveReviewRequest(options, root = process.cwd()) {
  if (options['request-json']) {
    const reqPath = resolveSafePath(options['request-json'], root);
    if (!existsSync(reqPath)) {
      throw new Error(`Review request file not found: ${reqPath}`);
    }
    return JSON.parse(readFileSync(reqPath, 'utf8'));
  }

  const promptPath = options.prompt || process.env.PROMPT_PATH;
  const schemaPath = options.schema || process.env.SCHEMA_PATH;

  if (!promptPath) {
    throw new Error('Missing prompt file path (--prompt or PROMPT_PATH).');
  }
  if (!schemaPath) {
    throw new Error('Missing schema file path (--schema or SCHEMA_PATH).');
  }

  const safePromptPath = resolveSafePath(promptPath, root);
  const safeSchemaPath = resolveSafePath(schemaPath, root);

  if (!existsSync(safePromptPath)) {
    throw new Error(`Missing or non-existent prompt file: ${safePromptPath}`);
  }
  if (!existsSync(safeSchemaPath)) {
    throw new Error(`Missing or non-existent schema file: ${safeSchemaPath}`);
  }

  const prompt = readFileSync(safePromptPath, 'utf8');
  const schema = JSON.parse(readFileSync(safeSchemaPath, 'utf8'));
  const model = options.model || process.env.MODEL || 'gemini-2.5-flash';
  const timeoutMs = Number(options.timeout || process.env.TIMEOUT_MS || 120000);

  const rawBudget = options['thinking-budget'] || options.budget || process.env.THINKING_BUDGET;
  const isExplicitGemini = options.provider === 'gemini' || process.env.REVIEWER_PROVIDER === 'gemini' || rawBudget !== undefined;

  let reviewer;
  if (isExplicitGemini) {
    if (options.effort || options['reasoning-effort'] || process.env.EFFORT) {
      throw new Error('Architecture gate reviewer failed: mixed thinkingBudget and reasoningEffort settings are not allowed.');
    }
    const budgetNum = rawBudget !== undefined ? Number(rawBudget) : 1024;
    reviewer = {
      provider: 'gemini',
      model,
      thinkingBudget: budgetNum,
      reviewTimeoutMs: timeoutMs,
    };
  } else {
    const reasoningEffort = options.effort || options['reasoning-effort'] || process.env.EFFORT || 'low';
    reviewer = {
      model,
      reasoningEffort,
      reviewTimeoutMs: timeoutMs,
    };
  }

  return {
    version: 1,
    prompt,
    schema,
    reviewer,
    repositoryRoot: root,
  };
}

/** Serialize only bounded single-line fields into the GitHub command protocol. */
export function formatGitHubReviewOutputs(decision, outputPath) {
  if (!['PASS', 'BLOCK', 'OWNER_DECISION'].includes(decision?.decision) ||
      typeof outputPath !== 'string' || /[\r\n]/.test(outputPath)) {
    throw new Error('Review outputs require a valid decision kind and a single-line output path.');
  }
  return `final-message=${JSON.stringify(decision)}\ndecision-file=${outputPath}\ndecision-kind=${decision.decision}\n`;
}

/**
 * Main execution routine for the Gemini CI review runner.
 * @param {string[]} argv
 * @param {string} cwd
 * @returns {Promise<object>} validated review decision
 */
export async function runGeminiCiReview(argv = process.argv.slice(2), cwd = process.cwd()) {
  const options = parseArgs(argv);
  const rawOutput = options.output || process.env.OUTPUT_PATH || 'decision.json';
  const outputPath = resolveSafePath(rawOutput, cwd);

  const request = resolveReviewRequest(options, cwd);

  const transportOptions = {};
  if (options.project) transportOptions.projectId = options.project;
  if (options.region) transportOptions.region = options.region;
  if (options['proxy-url'] || process.env.REVIEW_PROXY_URL) {
    transportOptions.proxyUrl = options['proxy-url'] || process.env.REVIEW_PROXY_URL;
  }
  if (options['base-url'] || process.env.GEMINI_BASE_URL) {
    transportOptions.baseUrl = options['base-url'] || process.env.GEMINI_BASE_URL;
  }
  
  // Codex P1: Preserve WIF precedence when forwarding credentials
  const hasAccessToken = Boolean(options['access-token'] || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN);
  if (hasAccessToken) {
    transportOptions.accessToken = options['access-token'] || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  } else if (options['api-key'] || process.env.GEMINI_API_KEY) {
    transportOptions.apiKey = options['api-key'] || process.env.GEMINI_API_KEY;
  }

  // Requirement 3: Complete request preflight before contacting a provider:
  // For revision-bound local requests verify request integrity, committed configuration and complete authority selection through shared mechanisms.
  // Treat the prompt/schema-only standalone path as a separately labeled compatibility route with no protected-authority claim.
  const isRevisionBound = Boolean(request.reviewedRevision || request.authoritySet);
  if (isRevisionBound) {
    await preflightReviewRequest(request, 'gemini');
  } else {
    process.stderr.write('[gemini-ci-runner] Warning: running standalone prompt/schema compatibility route (no protected authority claim).\n');
  }

  process.stderr.write(`[gemini-ci-runner] Invoking Gemini reviewer (${request.reviewer.model})...\n`);

  // Transport invocation
  const rawDecision = await runGeminiReviewer(request, transportOptions);

  // Schema-level deterministic validation
  validateJsonSchema(rawDecision, request.schema);

  // Validate complete review response if request is revision-bound or has authoritySet
  let validatedDecision = rawDecision;
  if (isRevisionBound) {
    validatedDecision = validateReviewResponse(request, rawDecision);
  }

  const githubOutputs = process.env.GITHUB_OUTPUT ? formatGitHubReviewOutputs(validatedDecision, outputPath) : null;

  // Persist result to output file
  const serialized = JSON.stringify(validatedDecision, null, 2);
  resolveSafePath(outputPath, cwd);
  writeFileSync(outputPath, `${serialized}\n`, { mode: 0o600, flag: constants.O_WRONLY | constants.O_CREAT | constants.O_TRUNC | (constants.O_NOFOLLOW ?? 0) });
  process.stderr.write(`[gemini-ci-runner] Review completed: decision=${validatedDecision.decision}, summary=${validatedDecision.summary}\n`);
  process.stderr.write(`[gemini-ci-runner] Decision persisted to: ${outputPath}\n`);

  // If running inside GitHub Actions, export output variables safely
  if (process.env.GITHUB_OUTPUT) {
    try {
      appendGitHubOutput(githubOutputs);
    } catch (err) {
      process.stderr.write(`[gemini-ci-runner] GITHUB_OUTPUT export skipped: ${err.message}\n`);
    }
  }

  return validatedDecision;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  runGeminiCiReview()
    .then((result) => {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
      process.exit(0);
    })
    .catch((error) => {
      process.stderr.write(`[gemini-ci-runner] ERROR: ${error.message}\n`);
      process.exit(2);
    });
}
