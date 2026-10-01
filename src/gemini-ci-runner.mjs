#!/usr/bin/env node
/**
 * src/gemini-ci-runner.mjs
 * Standalone review runner for Gemini provider in CI and local workflows.
 * Zero external npm dependencies: uses Node.js standard library and native fetch.
 */
import { appendFileSync, existsSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGeminiReviewer } from './gemini-transport.mjs';
import { validateJsonSchema } from './json-schema.mjs';

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
    const reqPath = resolve(root, options['request-json']);
    if (!existsSync(reqPath)) {
      throw new Error(`Review request file not found: ${reqPath}`);
    }
    return JSON.parse(readFileSync(reqPath, 'utf8'));
  }

  const promptPath = options.prompt || process.env.PROMPT_PATH;
  const schemaPath = options.schema || process.env.SCHEMA_PATH;

  if (!promptPath || !existsSync(resolve(root, promptPath))) {
    throw new Error(`Missing or non-existent prompt file: ${promptPath}`);
  }
  if (!schemaPath || !existsSync(resolve(root, schemaPath))) {
    throw new Error(`Missing or non-existent schema file: ${schemaPath}`);
  }

  const prompt = readFileSync(resolve(root, promptPath), 'utf8');
  const schema = JSON.parse(readFileSync(resolve(root, schemaPath), 'utf8'));
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
  const outputPath = resolve(cwd, options.output || process.env.OUTPUT_PATH || 'decision.json');

  const request = resolveReviewRequest(options, cwd);

  const transportOptions = {};
  if (options['proxy-url'] || process.env.REVIEW_PROXY_URL) {
    transportOptions.proxyUrl = options['proxy-url'] || process.env.REVIEW_PROXY_URL;
  }
  if (options['base-url'] || process.env.GEMINI_BASE_URL) {
    transportOptions.baseUrl = options['base-url'] || process.env.GEMINI_BASE_URL;
  }
  if (options['api-key'] || process.env.GEMINI_API_KEY) {
    transportOptions.apiKey = options['api-key'] || process.env.GEMINI_API_KEY;
  }
  if (options['access-token'] || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN) {
    transportOptions.accessToken = options['access-token'] || process.env.CLOUDSDK_AUTH_ACCESS_TOKEN;
  }

  process.stderr.write(`[gemini-ci-runner] Invoking Gemini reviewer (${request.reviewer.model}, effort=${request.reviewer.reasoningEffort})...\n`);

  // Transport invocation
  const rawDecision = await runGeminiReviewer(request, transportOptions);

  // Schema-level deterministic validation
  validateJsonSchema(rawDecision, request.schema);

  // Persist result to output file
  const targetOut = resolve(outputPath);
  const serialized = JSON.stringify(rawDecision, null, 2);
  writeFileSync(targetOut, `${serialized}\n`, { mode: 0o600 });
  process.stderr.write(`[gemini-ci-runner] Review completed: decision=${rawDecision.decision}, summary=${rawDecision.summary}\n`);
  process.stderr.write(`[gemini-ci-runner] Decision persisted to: ${targetOut}\n`);

  // If running inside GitHub Actions, export output variables
  const rawGithubOutput = process.env.GITHUB_OUTPUT;
  if (rawGithubOutput && typeof rawGithubOutput === 'string') {
    const safeGithubOutput = resolve(rawGithubOutput);
    if (existsSync(safeGithubOutput) && statSync(safeGithubOutput).isFile()) {
      const singleLine = JSON.stringify(rawDecision);
      appendFileSync(safeGithubOutput, `final-message=${singleLine}\n`, 'utf8');
      appendFileSync(safeGithubOutput, `decision-file=${targetOut}\n`, 'utf8');
      appendFileSync(safeGithubOutput, `decision-kind=${rawDecision.decision}\n`, 'utf8');
    }
  }

  return rawDecision;
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
