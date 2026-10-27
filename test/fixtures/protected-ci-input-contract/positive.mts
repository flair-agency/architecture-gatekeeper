import { prepareProtectedCiInput, type PrepareProtectedCiInput } from '../../../src/prepare-protected-ci-input.mts';
import { prepareGeminiCiInput, type PreparedGeminiCiInput } from '../../../src/prepare-gemini-ci-input.mts';
import type { AuthorityFetchRequest } from '../../../src/authority-validation/authority-set.mts';

const authority: PrepareProtectedCiInput['fetchExternal'] = (request: AuthorityFetchRequest) => {
  const requestedBytes: number = request.maxBytes;
  return Promise.resolve({ bytes: Buffer.alloc(requestedBytes) });
};
const selection = {
  root: '/workspace/repo', repository: 'org/repo', baseBranch: 'main',
  baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedSha: 'c'.repeat(40),
  policyPath: 'policy.json', promptPath: 'prompt.md', schemaPath: 'schema.json',
  validationPath: null, manifestPath: 'authority.json', referencePaths: ['README.md'],
};
const authorityLimits = { maxManifestBytes: 65_536, maxMembers: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288, maxPromptBytes: 1_048_576 };
const common = {
  selection: { ...selection, manifestPath: 'authority.json' },
  limits: {
    workspace: { maxFiles: 32, maxFileBytes: 131_072, maxTotalBytes: 524_288 },
    authority: authorityLimits, maxSchemaBytes: 131_072, maxResponseBytes: 65_536, maxDiffBytes: 196_608,
  },
  snapshots: [
    { path: 'policy.json', revision: selection.baseSha, bytes: Buffer.from('{}') },
    { path: 'prompt.md', revision: selection.baseSha, bytes: Buffer.from('review') },
    { path: 'schema.json', revision: selection.baseSha, bytes: Buffer.from('{}') },
    { path: 'authority.json', revision: selection.baseSha, bytes: Buffer.from('{}') },
  ],
  fetchExternal: authority,
} satisfies PrepareProtectedCiInput;
const protectedResult: Promise<Awaited<ReturnType<typeof prepareProtectedCiInput>>> = prepareProtectedCiInput(common);
const geminiResult: Promise<PreparedGeminiCiInput> = prepareGeminiCiInput(selection, authority);
void protectedResult;
void geminiResult;
