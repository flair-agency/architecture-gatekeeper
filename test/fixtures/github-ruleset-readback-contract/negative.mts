import type { RulesetReadbackContext, RulesetReadbackFetch, RulesetReadbackFetchResponse, RulesetReadbackSnapshot } from '../../../src/github/github-ruleset-readback.mjs';

declare const snapshot: RulesetReadbackSnapshot;
declare const context: RulesetReadbackContext;
const trustedId: number = snapshot.ruleset;
const wrongUrl: RulesetReadbackFetch = (_url: number, _options) => new Response('{}');
const wrongJson: RulesetReadbackFetchResponse = { ok: true, status: 200, json: 'not callable' };
const missingJson: RulesetReadbackFetch = (_url, _options) => ({ ok: true, status: 200 });
const wrongSnapshot: RulesetReadbackSnapshot = { ...snapshot, assurance: 'accepted' };
const falselyValidatedRevision: string = context.revision;
snapshot.observedAt = 2;
const wrongVersion: RulesetReadbackSnapshot = { ...snapshot, version: 2 };
const wrongKind: RulesetReadbackSnapshot = { ...snapshot, kind: 'accepted-ruleset' };
void [trustedId, wrongUrl, wrongJson, missingJson, wrongSnapshot, falselyValidatedRevision, wrongVersion, wrongKind];
