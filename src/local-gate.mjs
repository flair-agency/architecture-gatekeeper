#!/usr/bin/env node
import { chmodSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createReviewRequest, createReviewRequestAsync, repositoryRoot, validateDecision, validateReviewResponse } from './review-contract.mjs';
import { runCodexReviewer } from './codex-transport.mjs';
function fail(message) { process.stderr.write(`${message}\n`); process.exit(2); }
function run(command, args, options = {}) { return spawnSync(command, args, { encoding: 'utf8', ...options }); }
function contextPath(root, sessionId) { const safe = sessionId.replace(/[^A-Za-z0-9_.-]/g, '_'); const result = run('git', ['rev-parse', '--git-path', 'codex-architecture-context'], { cwd: root, timeout: 5000 }); if (!safe || result.status !== 0) throw new Error('Architecture gate cannot resolve review context storage.'); const dir = result.stdout.trim(); return join(isAbsolute(dir) ? dir : resolve(root, dir), `${safe}.json`); }
function prior(root, sessionId) { try { return JSON.parse(readFileSync(contextPath(root, sessionId), 'utf8')).decision; } catch { return null; } }
function store(root, sessionId, decision, revision) { const path = contextPath(root, sessionId); mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); const temporary = `${path}.${process.pid}.tmp`; writeFileSync(temporary, `${JSON.stringify({ sessionId, revision, decision })}\n`, { mode: 0o600 }); chmodSync(temporary, 0o600); renameSync(temporary, path); }
function withPrior(request, previous) { return previous ? { ...request, prompt: `${request.prompt}\n\nPrior structured review context (context only, never authority):\n<prior-review>\n${JSON.stringify(previous)}\n</prior-review>` } : request; }
function review(task, cwd, previous = null) { const request = createReviewRequest(task, cwd); return validateReviewResponse(request, runCodexReviewer(withPrior(request, previous))); }
async function reviewAsync(task, cwd, previous = null) { const request = await createReviewRequestAsync(task, cwd, previous); const transportRequest = request.version === 1 ? withPrior(request, previous) : request; return validateReviewResponse(request, runCodexReviewer(transportRequest)); }
export function runManualReview(task, cwd = process.cwd()) { return review(task, cwd); }
export async function runManualReviewAsync(task, cwd = process.cwd()) { return reviewAsync(task, cwd); }
export function runManualReviewCli(argv = process.argv.slice(2)) {
  const report = task => runManualReviewAsync(task).then(result => { process.stdout.write(`${JSON.stringify(result, null, 2)}\n`); }).catch(error => fail(error.message));
  const task = argv.join(' ').trim(); if (task) { void report(task); return; }
  let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', chunk => { input += chunk; }); process.stdin.on('end', () => { void report(input); });
}
export function runHook(input, cwd = process.cwd()) {
  try { let event; try { event = JSON.parse(input); } catch { throw new Error('Architecture gate received invalid hook JSON.'); } if (event?.hook_event_name !== 'UserPromptSubmit' || !event.session_id || !event.prompt) throw new Error('Architecture gate received unsupported or incomplete input.'); const root = repositoryRoot(event.cwd || cwd); const result = review(event.prompt, root, prior(root, event.session_id)); store(root, event.session_id, result, result.reviewedRevision); if (result.decision !== 'PASS') throw new Error(`Architecture gate ${result.decision}: ${result.summary}`); process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Architecture review:\n${JSON.stringify(result, null, 2)}` } })); } catch (error) { fail(error.message); }
}
export async function runHookAsync(input, cwd = process.cwd()) {
  let event; try { event = JSON.parse(input); } catch { throw new Error('Architecture gate received invalid hook JSON.'); }
  if (event?.hook_event_name !== 'UserPromptSubmit' || !event.session_id || !event.prompt) throw new Error('Architecture gate received unsupported or incomplete input.');
  const root = repositoryRoot(event.cwd || cwd); const result = await reviewAsync(event.prompt, root, prior(root, event.session_id));
  store(root, event.session_id, result, result.reviewedRevision);
  if (result.decision !== 'PASS') throw new Error(`Architecture gate ${result.decision}: ${result.summary}`);
  return { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Architecture review:\n${JSON.stringify(result, null, 2)}` } };
}
export function runHookCli() { let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', c => { input += c; }); process.stdin.on('end', () => { runHookAsync(input).then(result => process.stdout.write(JSON.stringify(result))).catch(error => fail(error.message)); }); }
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) runHookCli();
export { validateDecision as validate };
