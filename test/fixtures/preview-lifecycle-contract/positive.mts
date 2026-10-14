import { preparePreviewLifecycle, completePreviewLifecycle, validatePreviewReceipt,
  observePreviewLifecycle, prepareFreshPreviewReview, previewReceiptBytes } from '../../../src/preview-lifecycle.mjs';
declare const json: unknown;
const request = await preparePreviewLifecycle(json, '/synthetic');
const spec: unknown = request.spec;
const selection: unknown = request.selection;
const receipt = await completePreviewLifecycle(json, json, json);
const copiedRequest: unknown = receipt.request;
const copiedResponse: unknown = receipt.response;
const decision: unknown = receipt.decision;
const pending: 'PENDING' = receipt.adoption;
const canonical: 'PENDING' = receipt.canonical;
const producer: 'UNVERIFIED' = receipt.assurance.producerAuthentication;
const preserved: unknown = await validatePreviewReceipt(json, json);
const final = await observePreviewLifecycle(json, json, json, new Uint8Array());
const observed: 'OBSERVED' = final.adoption;
const verifiedPlacement: 'VERIFIED' = final.canonical;
const integration: unknown = final.integrationSha;
await prepareFreshPreviewReview(json, json, json);
const raw: Buffer = previewReceiptBytes(json);

await observePreviewLifecycle(json, json, json, 'receipt JSON');
await observePreviewLifecycle(json, json, json, new ArrayBuffer(0));
await observePreviewLifecycle(json, json, json, new SharedArrayBuffer(0));
await observePreviewLifecycle(json, json, json, [123, 125]);
await observePreviewLifecycle(json, json, json, Buffer.from('{}'));
await observePreviewLifecycle(json, json, json, { valueOf: () => new Uint8Array([123, 125]) });
await observePreviewLifecycle(json, json, json, { valueOf: () => new ArrayBuffer(0) });
await observePreviewLifecycle(json, json, json, { [Symbol.toPrimitive]: (_hint: 'string') => '{}' });

await observePreviewLifecycle(json, json, json, Buffer.from('{}').toJSON());
await observePreviewLifecycle(json, json, json, { valueOf: () => Buffer.from('{}').toJSON() });
