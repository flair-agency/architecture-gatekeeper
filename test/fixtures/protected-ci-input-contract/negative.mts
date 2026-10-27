import { prepareProtectedCiInput } from '../../../src/prepare-protected-ci-input.mts';
import { prepareGeminiCiInput, type PreparedGeminiCiInput } from '../../../src/prepare-gemini-ci-input.mts';
import type { PrepareProtectedCiInput } from '../../../src/prepare-protected-ci-input.mts';

declare const validInput: PrepareProtectedCiInput;
prepareProtectedCiInput({ ...validInput, snapshots: [{ path: 'policy.json', revision: 'a'.repeat(40), bytes: 'not bytes' }] });
prepareGeminiCiInput({ root: '/', repository: 'org/repo', baseBranch: 'main', baseSha: 'a', headSha: 'b', reviewedSha: 'c', policyPath: 'p', promptPath: 'p', schemaPath: 's', validationPath: null, referencePaths: [] }, 42);
declare const result: PreparedGeminiCiInput;
const wrongThinking: PreparedGeminiCiInput['protectedReviewer']['thinkingLevel'] = 'LOW';
const wrongDigest: string = result.bindings.authoritySetDigest;
void wrongThinking;
void wrongDigest;
