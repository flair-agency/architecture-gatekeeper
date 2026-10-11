import {
  buildOwnerAmendmentRecord,
  type OwnerAmendmentRecordBuilderInput,
} from '../../../src/owner-amendment/owner-amendment-record-builder.mts';

declare const input: OwnerAmendmentRecordBuilderInput;
const built = buildOwnerAmendmentRecord(input);
const generatedBytes: Buffer = built.bytes;
const version: 2 = built.record.version;
const repository: string = built.record.repository;
const purpose: string = built.record.purpose;
const reviewDigest: string = built.record.triggeringReviewSha256;
const coercionPreservingBase: unknown = built.record.baseSha;
const rereadAuthorityId: unknown = built.record.authority.id;
// The outer record is frozen, while its nested authority object remains mutable.
built.record.authority.id = 'runtime object remains unfrozen';
// @ts-expect-error the builder preserves the raw, possibly coerced scope value
const baseAsString: string = built.record.baseSha;
void [generatedBytes, version, repository, purpose, reviewDigest, coercionPreservingBase, rereadAuthorityId, baseAsString];
