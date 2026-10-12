import { validateOwnerAmendmentBlockSemanticRecord } from '../../../src/owner-amendment/owner-amendment-block-semantic-record.mts';
import type { OwnerAmendmentBlockSemanticRecordInput } from '../../../src/owner-amendment/owner-amendment-block-semantic-record.mts';

declare const result: ReturnType<typeof validateOwnerAmendmentBlockSemanticRecord>;
const authenticated: { authenticated: true } = result;
const repository: string = result.repository;
const changedPath: string = result.changes[0].path;
void [authenticated, repository, changedPath];

// @ts-expect-error Runtime always rejects the original optional-argument default, so the typed call requires fields.
validateOwnerAmendmentBlockSemanticRecord();
// @ts-expect-error An empty context is not a complete validator input.
validateOwnerAmendmentBlockSemanticRecord({});
declare const completeInput: OwnerAmendmentBlockSemanticRecordInput;
const { bytes: _bytes, ...withoutBytes } = completeInput;
// @ts-expect-error The byte observation is always checked before validation.
validateOwnerAmendmentBlockSemanticRecord(withoutBytes);
const { expected: _expected, ...withoutExpected } = completeInput;
// @ts-expect-error The expected comparison context is always required.
validateOwnerAmendmentBlockSemanticRecord(withoutExpected);
const { triggerProfile: _triggerProfile, ...withoutTriggerProfile } = completeInput;
// @ts-expect-error The profile guard is unconditional.
validateOwnerAmendmentBlockSemanticRecord(withoutTriggerProfile);
const { repository: _repository, ...withoutRepository } = completeInput;
// @ts-expect-error The repository is always compared with the parsed record.
validateOwnerAmendmentBlockSemanticRecord(withoutRepository);
const { baseSha: _baseSha, ...withoutBaseSha } = completeInput;
// @ts-expect-error The base SHA is always compared with the parsed record.
validateOwnerAmendmentBlockSemanticRecord(withoutBaseSha);
const { bSha: _bSha, ...withoutBSha } = completeInput;
// @ts-expect-error The B SHA is always compared with the parsed record.
validateOwnerAmendmentBlockSemanticRecord(withoutBSha);
