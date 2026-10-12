import '../../../src/github-ruleset-readback-cli.mjs';
import { produceRulesetReadback, type ProduceRulesetReadbackOptions,
  type RulesetReadbackFetch } from '../../../src/github/github-ruleset-readback.mts';

const nativeFetch: RulesetReadbackFetch = fetch;
const partialFetch: RulesetReadbackFetch = () => ({ ok: true, status: 200, json: () => ({}) });
const options: ProduceRulesetReadbackOptions = {
  env: {},
  fetchImpl: partialFetch,
  now: () => 1_800_000_000_000,
};
void [nativeFetch, produceRulesetReadback, options];
