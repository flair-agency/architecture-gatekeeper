import type { ProduceRulesetReadbackOptions } from '../../../src/github/github-ruleset-readback.mts';

// Readback clock callback is synchronous.
const asyncClock: ProduceRulesetReadbackOptions = { env: {}, now: async () => 1_800_000_000_000 };
// Every fetch response consumed by the producer exposes json().
const responseWithoutJson: ProduceRulesetReadbackOptions = { env: {}, fetchImpl: () => ({ ok: true, status: 200 }) };
void [asyncClock, responseWithoutJson];
