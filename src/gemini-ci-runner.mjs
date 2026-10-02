#!/usr/bin/env node
/**
 * src/gemini-ci-runner.mjs
 * Standalone review runner for Gemini provider in CI and local workflows.
 * Zero external npm dependencies: uses Node.js standard library and native fetch.
 */
import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { runGeminiReviewer } from './gemini-transport.mjs';
import { validateJsonSchema } from './json-schema.mjs';
import { validateReviewResponse } from './review-contract.mjs';
import { appendGitHubOutput } from './runner-temp-path.mjs';

/**
 * Resolves a file path relative to an authorized root directory using lexical checks.
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
  const model = options.model || process.env.MODEL || 'gemini-3.8-flash';
  const reasoningEffort = options.effort || options['reasoning-effort'] || process.env.EFFORT || 'low';
  const timeoutMs = Number(options.timeout || process.env.TIMEOUT_MS || 120000);

  return {
    version: 1,
    prompt,
    schema,
    reviewer: {
      model,
      reasoningEffort,
      reviewTimeoutMs: timeoutMs,
    },
    repositoryRoot: root,
  };
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

  process.stderr.write(`[gemini-ci-runner] Invoking Gemini reviewer (${request.reviewer.model}, effort=${request.reviewer.reasoningEffort})...\n`);

  // Transport invocation
  const rawDecision = await runGeminiReviewer(request, transportOptions);

  // Schema-level deterministic validation
  validateJsonSchema(rawDecision, request.schema);

  // Validate complete review response if request is revision-bound or has authoritySet
  let validatedDecision = rawDecision;
  if (request.reviewedRevision || request.authoritySet) {
    validatedDecision = validateReviewResponse(request, rawDecision);
  }

  // Persist result to output file
  const serialized = JSON.stringify(validatedDecision, null, 2);
  writeFileSync(outputPath, `${serialized}\n`, { mode: 0o600 });
  process.stderr.write(`[gemini-ci-runner] Review completed: decision=${validatedDecision.decision}, summary=${validatedDecision.summary}\n`);
  process.stderr.write(`[gemini-ci-runner] Decision persisted to: ${outputPath}\n`);

  // If running inside GitHub Actions, export output variables safely
  if (process.env.GITHUB_OUTPUT) {
    const singleLine = JSON.stringify(validatedDecision);
    try {
      appendGitHubOutput(`final-message=${singleLine}\ndecision-file=${outputPath}\ndecision-kind=${validatedDecision.decision}\n`);
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
