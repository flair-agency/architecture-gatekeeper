import { validateOwnerAmendmentBlockSemanticRecord } from '../../../src/owner-amendment/owner-amendment-block-semantic-record.mts';
import type { OwnerAmendmentBlockSemanticRecordInput } from '../../../src/owner-amendment/owner-amendment-block-semantic-record.mts';

declare const result: ReturnType<typeof validateOwnerAmendmentBlockSemanticRecord>;
const authenticated: { authenticated: true } = result;
const repository: string = result.repository;
const changedPath: string = result.changes[0].path;
void [authenticated, repository, changedPath];

// Runtime always rejects the original optional-argument default, so the typed call requires fields.
validateOwnerAmendmentBlockSemanticRecord();
// An empty context is not a complete validator input.
validateOwnerAmendmentBlockSemanticRecord({});
declare const completeInput: OwnerAmendmentBlockSemanticRecordInput;
const { bytes: _bytes, ...withoutBytes } = completeInput;
// The byte observation is always checked before validation.
validateOwnerAmendmentBlockSemanticRecord(withoutBytes);
const { expected: _expected, ...withoutExpected } = completeInput;
// The expected comparison context is always required.
validateOwnerAmendmentBlockSemanticRecord(withoutExpected);
const { triggerProfile: _triggerProfile, ...withoutTriggerProfile } = completeInput;
// The profile guard is unconditional.
validateOwnerAmendmentBlockSemanticRecord(withoutTriggerProfile);
const { repository: _repository, ...withoutRepository } = completeInput;
// The repository is always compared with the parsed record.
validateOwnerAmendmentBlockSemanticRecord(withoutRepository);
const { baseSha: _baseSha, ...withoutBaseSha } = completeInput;
// The base SHA is always compared with the parsed record.
validateOwnerAmendmentBlockSemanticRecord(withoutBaseSha);
const { bSha: _bSha, ...withoutBSha } = completeInput;
// The B SHA is always compared with the parsed record.
validateOwnerAmendmentBlockSemanticRecord(withoutBSha);
