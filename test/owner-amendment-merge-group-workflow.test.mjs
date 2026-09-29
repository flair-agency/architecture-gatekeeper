import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('merge_group verifier runs only protected-base code with read-only GitHub permissions', () => {
  const workflow = readFileSync(new URL('../.github/workflows/owner-amendment-merge-group-accept.yml', import.meta.url), 'utf8');
  assert.match(workflow, /^name: Architecture Gate \/ OWNER_AMENDMENT merge_group/m);
  assert.match(workflow, /merge_group:\n    types: \[checks_requested\]/);
  assert.match(workflow, /ref: \$\{\{ github\.event\.merge_group\.base_sha \}\}/);
  assert.match(workflow, /GATEKEEPER_RUNTIME_SHA: \$\{\{ github\.workflow_sha \}\}/);
  assert.match(workflow, /OWNER_AMENDMENT_TAG_RULESET_ID: \$\{\{ vars\.OWNER_AMENDMENT_TAG_RULESET_ID \}\}/);
  assert.match(workflow, /node scripts\/owner-amendment-merge-group-gate\.mjs/);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY|secrets\./);
  assert.match(workflow, /contents: read[\s\S]*pull-requests: read[\s\S]*actions: read[\s\S]*attestations: read/);
  assert.doesNotMatch(workflow, /contents: write|pull-requests: write|id-token: write/);
});
