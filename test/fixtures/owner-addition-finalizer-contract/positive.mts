import * as flat from '../../../src/owner-addition-finalize.mts';
import * as physical from '../../../src/owner-addition/finalize-owner-addition.mts';
import type { OwnerAdditionFinalizerInput, OwnerAdditionFinalizerFetch, OwnerAdditionTagRefReadback } from '../../../src/owner-addition/finalize-owner-addition.mts';
import type { OwnerAdditionFinalRecord } from '../../../src/owner-addition/owner-addition-finalize.mts';

const nativeFetch: OwnerAdditionFinalizerFetch = fetch;
const synchronous: OwnerAdditionFinalizerFetch = (url, options) => {
  const path: string = url;
  const redirect: 'follow' = options.redirect;
  const headers: Record<string, string> = options.headers;
  void [path, redirect, headers];
  return { ok: true, status: 200, json: () => ({ observed: true }) };
};
const asyncResponse: OwnerAdditionFinalizerFetch = async () => ({ ok: true, json: async () => null });
const thenableResponse: OwnerAdditionFinalizerFetch = () => ({ then: (resolve: (value: unknown) => void) => resolve({ ok: true, json: () => null }) });
const input: OwnerAdditionFinalizerInput = {
  repository: 'flair-agency/example', pullRequestNumber: 42, githubToken: 'synthetic-token', runId: '100',
  attempt: 1, policyPath: undefined, fetchImpl: nativeFetch, identities: { observation: true },
};
const result: Promise<OwnerAdditionFinalRecord> = flat.finalizeOwnerAddition(input);
const physicalResult: Promise<OwnerAdditionFinalRecord> = physical.finalizeOwnerAddition({ ...input, fetchImpl: synchronous });
const typedFlat: typeof physical.finalizeOwnerAddition = flat.finalizeOwnerAddition;
const cli: Promise<void> = physical.runOwnerAdditionFinalizeCli();
const record: unknown = flat.verifyG0TagObjectEvidence({}, {});
const ancestors: unknown[] = flat.verifyMergeAncestorComparison({}, 'a'.repeat(40), 'b'.repeat(40));
const ref: OwnerAdditionTagRefReadback = flat.summarizeG0TagRefReadback({}, 'refs/tags/example', 'c'.repeat(40));
if (ref.status !== 'unavailable') {
  const observedOid: unknown = ref.observedObjectOid;
  const observedType: unknown = ref.observedObjectType;
  void [observedOid, observedType];
}
const response = await physical.readG0TagObjectReadback({}, {});
if (response.status === 'unavailable') {
  const absent: null = response.additionRecord;
  void absent;
} else {
  const observed: unknown = response.additionRecord;
  void observed;
}
const parserInput: unknown = new Uint8Array();
const workflow = flat.parsePinnedGatekeeperWorkflow(parserInput);
const callerJob: string = workflow.callerJobId;
const pin: string = workflow.sha;
const defaults: Record<string, string> = physical.parseGatekeeperWorkflowDefaults(new ArrayBuffer(0));
void [asyncResponse, thenableResponse, result, physicalResult, typedFlat, cli, record, ancestors, ref, callerJob, pin, defaults];
