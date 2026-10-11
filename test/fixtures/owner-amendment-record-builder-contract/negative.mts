import {
  buildOwnerAmendmentRecord,
  type OwnerAmendmentRecordBuilderInput,
} from '../../../src/owner-amendment/owner-amendment-record-builder.mts';

declare const input: OwnerAmendmentRecordBuilderInput;
const built = buildOwnerAmendmentRecord(input);
built.record.repository = 'other/project';
const bytes: string = built.bytes;
const scopeBase: string = built.record.baseSha;
void [bytes, scopeBase];
