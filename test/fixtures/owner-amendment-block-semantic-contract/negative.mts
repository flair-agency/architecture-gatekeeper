import { validateOwnerAmendmentBlockSemanticRecord } from '../../../src/owner-amendment/owner-amendment-block-semantic-record.mts';

declare const result: ReturnType<typeof validateOwnerAmendmentBlockSemanticRecord>;
const authenticated: { authenticated: true } = result;
const repository: string = result.repository;
const changedPath: string = result.changes[0].path;
void [authenticated, repository, changedPath];
