import { composeOwnerAmendmentBlockHandoff } from '../../../src/owner-amendment/owner-amendment-block-handoff-compose.mts';
import type { ComposeOwnerAmendmentBlockHandoffInput } from '../../../src/owner-amendment/owner-amendment-block-handoff-compose.mts';

const badBuilder: NonNullable<ComposeOwnerAmendmentBlockHandoffInput['buildAmendmentRecordBytes']> =
  (recordBytes: string, bundleBytes: Buffer) => Buffer.from(recordBytes + bundleBytes.length);
declare const result: Awaited<ReturnType<typeof composeOwnerAmendmentBlockHandoff>>;
if (result.status === 'INCOMPLETE') {
  const knownSha: string = result.reason;
}
result.status = 'INCOMPLETE';
void badBuilder;
