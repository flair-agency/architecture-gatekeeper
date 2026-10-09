import {
  produceRulesetReadback,
  readLocalRulesetReadback,
  rulesetReadbackContext,
  validateCompleteRuleset,
} from '../../../src/github/github-ruleset-readback.mjs';
import type {
  RulesetReadbackEnvironment,
  RulesetReadbackFetch,
  RulesetReadbackFetchResponse,
  RulesetReadbackSnapshot,
} from '../../../src/github/github-ruleset-readback.mjs';

const external: unknown = {};
const env: RulesetReadbackEnvironment = process.env;
const synchronousFetch: RulesetReadbackFetch = (_url, _options) => new Response('{}');
const asynchronousFetch: RulesetReadbackFetch = async (_url, _options) => new Response('{}');
const responsePromise = Promise.resolve(new Response('{}'));
const thenableFetch: RulesetReadbackFetch = (_url, _options) => ({ then: responsePromise.then.bind(responsePromise) });
const synchronousJson: RulesetReadbackFetchResponse = { ok: true, status: 200, json: () => external };
const asynchronousJson: RulesetReadbackFetchResponse = { ok: true, status: 200, json: async () => external };
const jsonPromise = Promise.resolve(external);
const thenableJson: RulesetReadbackFetchResponse = { ok: true, status: 200, json: () => ({ then: jsonPromise.then.bind(jsonPromise) }) };
const standardFetch: RulesetReadbackFetch = globalThis.fetch;
const context = rulesetReadbackContext(env);
const completed: Promise<RulesetReadbackSnapshot> = produceRulesetReadback({ env, fetchImpl: standardFetch, now: () => 1 });
for (const fetchImpl of [synchronousFetch, asynchronousFetch, thenableFetch]) void produceRulesetReadback({ env, fetchImpl });
for (const response of [synchronousJson, asynchronousJson, thenableJson]) void response;
const checked: unknown = validateCompleteRuleset(external, context.rulesetId, context.tagNamespace);
const local: unknown = readLocalRulesetReadback(external, env, { baseSha: 'a'.repeat(40), rulesetId: context.rulesetId, tagNamespace: context.tagNamespace });
void [completed, checked, local];
