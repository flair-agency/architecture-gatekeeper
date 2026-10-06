/** Internal orchestration for one materialized Gemini CLI review session. */
import { materializeReviewWorkspace } from './materialize-review-workspace.mjs';
import { runGeminiCliProcess } from './gemini-cli-process.mjs';
import { extractGeminiCliResponseText } from './gemini-cli-response.mjs';

const PROCESS_OPTION_KEYS = new Set([
  'cliEntrypoint', 'privateParentDirectory', 'prompt', 'model', 'thinkingBudget', 'thinkingLevel', 'maxOutputTokens',
  'project', 'region', 'proxyUrl', 'timeoutMs', 'maxPromptBytes',
  'maxStdoutBytes', 'maxStderrBytes', 'signal',
]);

/**
 * Materialize caller-selected evidence, run the CLI against that workspace,
 * and return only its extracted response text. The trusted caller remains
 * responsible for request/policy/revision binding, prompt completeness,
 * credentials, and downstream schema/authority validation. The prompt must
 * direct the reviewer to inspect the generated manifest and every evidence
 * snapshot. Neither result text nor workspace provenance is a decision claim.
 */
export async function runGeminiCliSession({ packet, workspaceLimits, workspaceParentDirectory, processOptions } = {}) {
  if (!processOptions || typeof processOptions !== 'object' || Array.isArray(processOptions)) {
    throw new Error('Gemini CLI session requires explicit process options.');
  }
  if (Object.hasOwn(processOptions, 'workspaceDirectory')) {
    throw new Error('Gemini CLI session workspace is selected by its materialized packet.');
  }
  if (Object.keys(processOptions).some(key => !PROCESS_OPTION_KEYS.has(key))) {
    throw new Error('Gemini CLI session received an unsupported process option.');
  }
  const workspace = materializeReviewWorkspace(packet, {
    parentDirectory: workspaceParentDirectory,
    limits: workspaceLimits,
  });
  try {
    const result = await runGeminiCliProcess({ ...processOptions, workspaceDirectory: workspace.directory });
    return extractGeminiCliResponseText(result, {
      maxStdoutBytes: processOptions.maxStdoutBytes,
      maxStderrBytes: processOptions.maxStderrBytes,
    });
  } finally {
    workspace.cleanup();
  }
}
