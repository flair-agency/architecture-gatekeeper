# Shared JSON parser caller inventory

Issue #413 hardens the shared `rejectDuplicateJsonKeys` entrypoint in
`src/authority-set.mjs`. It now runs `JSON.parse` before its delimiter scanner,
so malformed text fails before the scanner uses JSON grammar assumptions. A
valid duplicate-key document still fails during scanning. Caller-owned byte
limits, UTF-8 decoding, schema checks, and configured depth limits remain in
their existing layers.

## Callers and input contracts

| Source caller | Input contract and limit owner | Call ordering before this change |
| --- | --- | --- |
| `authority-set.mjs` / `parseAuthorityManifest` | Buffer or string, then selected `maxManifestBytes`; fatal UTF-8 decode; manifest/member checks; default parser depth 8 | `JSON.parse`, then duplicate scan |
| `ci-execution-observation.mjs` / observation | Stdin capped at 512 KiB; fatal UTF-8; parser depth 70 | `JSON.parse`, then duplicate scan |
| `ci-execution-observation.mjs` / settings | Canonical base64, encoded length at most 5,464 and decoded bytes at most 4 KiB; fatal UTF-8; parser depth 64 | `JSON.parse`, then duplicate scan |
| `owner-addition-multiauthority.mjs` / `validateMultiAuthorityEligibility` | Direct raw string has no local byte cap; supplied schema and provenance are validated before raw parsing | Duplicate scan, then parse |
| `prepare-authority-set.mjs` / `readLimits` | Regular file capped at 4 KiB; fatal UTF-8; limits shape checked by `validateAuthorityLimits` | `JSON.parse`, then duplicate scan |
| `prepare-authority-set.mjs` / `decodeLimits` | Canonical base64; encoded length at most 8 KiB and decoded bytes at most 4 KiB; fatal UTF-8; limits shape checked afterward | Duplicate scan, then parse |
| `review-contract.mjs` / `loadConfig` | Text from recorded Git revision; no explicit application byte cap at this input; config fields and limits checked afterward | Duplicate scan, then parse |
| `review-contract.mjs` / `reviewerSettings` | Text from recorded Git revision; no explicit application byte cap at this input; provider fields checked afterward | `JSON.parse`, then duplicate scan |
| `resolve-ci-policy.mjs` / `parseCiPolicyJson` | Direct string has no local byte cap; CLI reads its selected file with `readFileSync`; policy shape checked after parse | Duplicate scan, then parse |
| `prepared-ci-decision.mjs` | Fatal UTF-8; selected response/schema limits at most 64 KiB / 1 MiB; parser depths 256 / 514 | `JSON.parse`, then duplicate scan |
| `owner-amendment-semantic-eligibility.mjs` | Policy 65,536 bytes; records 131,072; decisions 65,536; tag object 262,144; receipt 131,072; fatal UTF-8 | Duplicate scan, then parse |
| `owner-amendment-block-context-verifier.mjs` | Fatal UTF-8; ReviewRecord 131,072, AmendmentRecord 8,192, BLOCK decision 65,536 bytes | Duplicate scan, then parse |
| `owner-amendment-block-record.mjs` | Fatal UTF-8; exact decision bytes capped at 65,536 | Duplicate scan, then parse |
| `owner-amendment-owner-decision-record.mjs` | Fatal UTF-8; exact decision bytes capped at 65,536 | Duplicate scan, then parse |
| `owner-amendment-owner-decision-amendment-record.mjs` | Fatal UTF-8; ReviewRecord default 131,072, embedded decision 65,536, AmendmentRecord 8,192 bytes | Duplicate scan, then parse |
| `owner-amendment-owner-decision-context-verifier.mjs` | Fatal UTF-8; ReviewRecord 131,072, exact decision 65,536, AmendmentRecord 8,192 bytes | Duplicate scan, then parse |
| `owner-amendment-merge-group-evidence.mjs` | Tag object capped at 262,144; helper checks its one-line envelope. Nested records here use plain `JSON.parse`, not this helper | Duplicate scan, then parse |
| `owner-amendment-merge-group-ordinary-review.mjs` | Protected policy capped at 65,536, schema/validation at 262,144, decision at 262,144; fatal UTF-8 where decoded | Schema/validation: parse, then scan; decision: scan, then parse |
| `owner-amendment-record-builder.mjs` | ReviewRecord capped at 131,072; embedded decision is base64 within that record; fatal UTF-8 | Duplicate scan, then parse |
| `owner-addition-finalize.mjs` | `tagObject.message` is a direct string with no local byte cap; procedure/tag bindings follow | Duplicate scan, then parse |
| `github-owner-addition-provenance.mjs` | Artifact ZIP capped at 1 MiB and decoded JSON entry at 512 KiB; fatal UTF-8 | Duplicate scan, then parse |
| `preview-lifecycle.mjs` | Committed JSON snapshot defaults to 1 MiB; raw completed receipt capped at 4 MiB; receipt depth 64 | Duplicate scan, then parse |

The ordering column records the caller's local sequence, not a required API
contract. The shared function now enforces syntax validity itself, so both
orders have the same finite malformed-input behavior. A byte limit is listed
only where the caller enforces one. Direct CI policy, committed
configuration/reviewer text, owner-addition eligibility text, and the G0
AdditionRecord message have no local byte cap at their parser call. This
change adds no input source, assurance responsibility, or acceptance route.

## Verification and release impact

`test/json-input.test.mjs` runs malformed input through policy, configuration,
limits, owner-addition, owner-amendment, and prepared-decision entrypoints in a
five-second bounded child. Its generated corpus includes valid JSON and every
syntactically invalid prefix of those documents, plus malformed separators,
escapes and trailing text. It verifies a manifest at its exact byte limit,
rejects one byte over and rejects malformed UTF-8. Existing
`test/prepared-ci-decision.test.mjs` cases retain prepared decision/schema byte
boundary coverage. Unicode-equivalent duplicate keys and depths 1 and 514 are
also covered.

The old hang is recorded as a manually executable reproduction instead of an
always-hanging test fixture. Run from this checkout; the child is externally
terminated after 500 ms:

```js
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'agk-json-baseline-'));
try {
  const modulePath = join(dir, 'authority-set.mjs');
  writeFileSync(modulePath, execFileSync('git', [
    'show', '82a45df3140f2973b09811465a9d0f01e178f79b:src/authority-set.mjs',
  ], { encoding: 'utf8' }));
  const script = `import { rejectDuplicateJsonKeys } from ${JSON.stringify(pathToFileURL(modulePath).href)}; rejectDuplicateJsonKeys('[');`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { timeout: 500 });
  console.log(result.error?.code === 'ETIMEDOUT' ? 'baseline hang reproduced' : 'baseline reproduction failed');
  if (result.error?.code !== 'ETIMEDOUT') process.exitCode = 1;
} finally {
  rmSync(dir, { recursive: true, force: true });
}
```

The affected source is present at worktree base
`82a45df3140f2973b09811465a9d0f01e178f79b`; Issue #413's cited failing helper
is also present at its baseline
`6ca1c4a7b5afb32df4f0456d8d7896474bfcf181`. The work changes one internal
source function and adds source tests and this investigation note. It changes
no package metadata, export map, workflow, or release configuration. This
assessment does not establish which package versions have been published or
whether a particular consumer is affected.
