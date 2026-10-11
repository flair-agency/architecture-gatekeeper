/** Internal orchestration for one materialized Gemini CLI review session. */
import { materializeReviewWorkspace } from '../review-inputs/materialize-review-workspace.mts';
import type { ReviewFileContextLimits, ReviewFileContextPacket } from '../review-inputs/prepare-review-file-context.mts';
import { runGeminiCliProcess, type GeminiCliProcessResult, type GeminiCliThinkingOptions } from './gemini-cli-process.mts';
import { extractGeminiCliResponseText } from './gemini-cli-response.mts';

const PROCESS_OPTION_KEYS = new Set([
  'cliEntrypoint', 'privateParentDirectory', 'prompt', 'model', 'thinkingBudget', 'thinkingLevel',
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
    const result: GeminiCliProcessResult = await runGeminiCliProcess({ ...processOptions, workspaceDirectory: workspace.directory });
    return extractGeminiCliResponseText(result, {
      maxStdoutBytes: processOptions.maxStdoutBytes,
      maxStderrBytes: processOptions.maxStderrBytes,
    });
  } finally {
    workspace.cleanup();
  }
}
