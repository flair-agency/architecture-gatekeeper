import { prepareOrdinaryGeminiCiAdapter, executeOrdinaryGeminiCiAdapter, type OrdinaryGeminiAdapterInput, type OrdinaryGeminiExecutionInput } from '../../../src/ordinary-gemini-ci-adapter.mts';
import { buildPreparedGeminiCiCall } from '../../../src/prepared-gemini-ci-call.mts';
import { inspectPinnedGeminiCiRuntime } from '../../../src/gemini-ci-runtime.mts';
prepareOrdinaryGeminiCiAdapter({ host: {}, runtime: { directory: 3 }, sourceToken: false });

executeOrdinaryGeminiCiAdapter({ preparation: {}, credential: { token: 't', project: 'p', region: 'us-east1' } });
declare const prepared: import('../../../src/prepare-gemini-ci-input.mts').PreparedGeminiCiInput;
buildPreparedGeminiCiCall({ prepared: { ...prepared, protectedPromptText: 3 }, credential: { token: 't', project: 'p', region: 'us-east1' }, runtimeEntry: '/r', privateParentDirectory: '/p' });
inspectPinnedGeminiCiRuntime({ runtimeDirectory: '/tmp', lockBytes: 'not bytes' });
