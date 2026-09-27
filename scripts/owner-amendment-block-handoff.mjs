#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { prepareOwnerAmendmentBlockHandoffFromFiles, writeOwnerAmendmentTagMessage } from '../src/owner-amendment-block-handoff.mjs';

export function main(args) {
  // This prepares a candidate tag message only. The expected producer JSON
  // must come from a separately verified protected-base/host source; this
  // command does not authenticate that file or authorize amendment adoption.
  if (args.length !== 6) throw new Error('Usage: owner-amendment-block-handoff <review-record.json> <attestation-bundle.json> <trusted-producer.json> <amendment-record.json> <exact-B-sha> <tag-message-out>');
  const [recordPath, bundlePath, expectedPath, amendmentRecordPath, bSha, outputPath] = args;
  const expected = JSON.parse(readFileSync(expectedPath, 'utf8'));
  const result = prepareOwnerAmendmentBlockHandoffFromFiles({ recordPath, bundlePath, amendmentRecordPath, expected, bSha });
  writeOwnerAmendmentTagMessage(result, outputPath);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; }
}
