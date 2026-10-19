/** Internal orchestration for one materialized Gemini CLI review session. */
import { materializeReviewWorkspace } from '../review-inputs/materialize-review-workspace.mts';
import type { ReviewFileContextLimits, ReviewFileContextPacket } from '../review-inputs/prepare-review-file-context.mts';
import { runGeminiCliProcess, type GeminiCliProcessResult, type GeminiCliThinkingOptions } from './gemini-cli-process.mts';
import { extractGeminiCliResponseText } from './gemini-cli-response.mts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const GEMINI_CLI_MAX_LINE_CODE_UNITS = 2000;

const PROCESS_OPTION_KEYS = new Set([
  'cliEntrypoint', 'privateParentDirectory', 'prompt', 'model', 'thinkingBudget', 'thinkingLevel', 'maxOutputTokens',
  'project', 'region', 'proxyUrl', 'timeoutMs', 'maxPromptBytes',
  'maxStdoutBytes', 'maxStderrBytes', 'signal',
]);

interface GeminiCliSessionProcessCommonOptions {
  readonly cliEntrypoint: string;
  readonly privateParentDirectory: string;
  readonly prompt: string;
  readonly project: string;
  readonly region: string;
  readonly proxyUrl: string;
  readonly timeoutMs: number;
  readonly maxPromptBytes: number;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
  readonly maxOutputTokens?: number;
  readonly signal?: AbortSignal;
}

type GeminiCliSessionModelOptions<Model extends string> = Model extends string
  ? { readonly model: Model } & GeminiCliThinkingOptions<Model>
  : never;
type GeminiCliSessionProcessOptionsForModel<Model extends string> = string extends Model
  ? { readonly model: Model } & GeminiCliThinkingOptions<Model>
  : GeminiCliSessionModelOptions<Model>;
export type GeminiCliSessionProcessOptions<Model extends string = string> = GeminiCliSessionProcessCommonOptions &
  GeminiCliSessionProcessOptionsForModel<Model>;

export interface GeminiCliSessionInput<Model extends string = string> {
  readonly packet: ReviewFileContextPacket;
  readonly workspaceLimits: ReviewFileContextLimits;
  readonly workspaceParentDirectory: string;
  readonly processOptions: GeminiCliSessionProcessOptions<Model>;
}

type GeminiCliSessionInputForModel<Model extends string> = Omit<GeminiCliSessionInput<Model>, 'processOptions'> & {
  readonly processOptions: GeminiCliSessionProcessCommonOptions & { readonly model: Model } &
    NoInfer<GeminiCliSessionProcessOptionsForModel<Model>>;
};

interface GeminiCliSessionRuntimeInput {
  packet: ReviewFileContextPacket;
  workspaceLimits: ReviewFileContextLimits;
  workspaceParentDirectory: string;
  processOptions: GeminiCliSessionProcessOptions;
}

/**
 * Gemini CLI 0.62.0 truncates each text line to 2,000 UTF-16 code units.
 * read_file has no column-range option, so such a line cannot be recovered
 * with follow-up line reads. Check the generated manifest and every physical
 * evidence snapshot before starting the reviewer process.
 */
function rejectUnrecoverablyLongGeminiLines(workspaceDirectory: string): void {
  const paths = [join(workspaceDirectory, 'manifest.json'),
    ...readdirSync(join(workspaceDirectory, 'evidence')).map(name => join(workspaceDirectory, 'evidence', name))];
  for (const path of paths) {
    const lines = readFileSync(path, 'utf8').split(/\r?\n/);
    if (lines.some(line => line.length > GEMINI_CLI_MAX_LINE_CODE_UNITS)) {
      throw new Error('Gemini CLI review is incomplete: materialized evidence contains a line that the pinned CLI truncates and cannot recover.');
    }
  }
}

/**
 * Materialize caller-selected evidence, run the CLI against that workspace,
 * and return only its extracted response text. The trusted caller remains
 * responsible for request/policy/revision binding, prompt completeness,
 * credentials, and downstream schema/authority validation. The prompt must
 * direct the reviewer to inspect the generated manifest and every evidence
 * snapshot. Neither result text nor workspace provenance is a decision claim.
 */
export function runGeminiCliSession<const Model extends string = string>(input: GeminiCliSessionInputForModel<Model>): Promise<string>;
export async function runGeminiCliSession({ packet, workspaceLimits, workspaceParentDirectory, processOptions } = {} as GeminiCliSessionRuntimeInput | GeminiCliSessionInputForModel<string>): Promise<string> {
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
    rejectUnrecoverablyLongGeminiLines(workspace.directory);
    const result: GeminiCliProcessResult = await runGeminiCliProcess({ ...processOptions, workspaceDirectory: workspace.directory });
    return extractGeminiCliResponseText(result, {
      maxStdoutBytes: processOptions.maxStdoutBytes,
      maxStderrBytes: processOptions.maxStderrBytes,
    });
  } finally {
    workspace.cleanup();
  }
}
