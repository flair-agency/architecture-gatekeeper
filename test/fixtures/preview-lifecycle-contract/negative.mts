import { preparePreviewLifecycle, completePreviewLifecycle, validatePreviewReceipt,
  observePreviewLifecycle, prepareFreshPreviewReview } from '../../../src/preview-lifecycle.mts';
declare const json: unknown;
const request = await preparePreviewLifecycle(json);
const spec: { mode: string } = request.spec;
const selection: { authorization: string } = request.selection;
const receipt = await completePreviewLifecycle(json, json);
const decision: { decision: 'PASS' } = receipt.decision;
const response: { checks: object } = receipt.response;
const accepted: 'ACCEPTED' = receipt.adoption;
const authenticated: 'VERIFIED' = receipt.assurance.ownerAuthentication;
const checked: { request: object } = await validatePreviewReceipt(json);
preparePreviewLifecycle();
completePreviewLifecycle(json);
observePreviewLifecycle(json);
prepareFreshPreviewReview(json);
observePreviewLifecycle(json, json, json, 42);
preparePreviewLifecycle(json, 42);
observePreviewLifecycle(json, json, json, false);
