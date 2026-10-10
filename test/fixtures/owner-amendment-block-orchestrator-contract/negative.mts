import { orchestrateOwnerAmendmentBlockHandoff } from '../../../src/owner-amendment-block-handoff-orchestrator.mjs';
import type { OwnerAmendmentBlockHandoffInput } from '../../../src/owner-amendment/owner-amendment-block-handoff-orchestrator.mts';

const badFetch: OwnerAmendmentBlockHandoffInput['fetchImpl'] = (_url: number, _init) => ({ ok: true, status: 200, json: () => ({}), body: null });
const badConfig: OwnerAmendmentBlockHandoffInput = {
  repository: 'owner/repo', policy: {}, manifest: {}, baseSha: 'a'.repeat(40), bSha: 'b'.repeat(40),
  changedFiles: [], baseAuthorityBytes: Buffer.alloc(1), headAuthorityBytes: Buffer.alloc(1), blockRun: {},
  purpose: 'purpose', token: 'token', runGh: (_file, _args, _options) => Promise.resolve('[]'), rulesetId: 7,
  tagger: { name: 'test', email: 'test@example.invalid', date: '2026-01-01T00:00:00.000Z' }, fetchImpl: badFetch,
};
void badConfig;

const result = await orchestrateOwnerAmendmentBlockHandoff({ ...badConfig, rulesetId: 7 });
if (result.status === 'TAG_TRANSPORTED_AND_READ_BACK') {
  const wrongSha: string = result.tagObjectSha;
  void wrongSha;
  result.status = 'INCOMPLETE';
}
