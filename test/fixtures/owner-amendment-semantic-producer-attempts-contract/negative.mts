import { assertMissingOwnerAmendmentTagHasNoSuccessfulSigner,
  inspectOwnerAmendmentSemanticProducerAttempts } from '../../../src/owner-amendment-semantic-producer-attempts.mjs';
import type {
  OwnerAmendmentSemanticProducerAttemptsInput,
  OwnerAmendmentSemanticProducerAttemptsResult,
} from '../../../src/owner-amendment/owner-amendment-semantic-producer-attempts.mts';

declare const external: unknown;
declare const result: OwnerAmendmentSemanticProducerAttemptsResult;
inspectOwnerAmendmentSemanticProducerAttempts({});
const mutableAttempts: OwnerAmendmentSemanticProducerAttemptsResult['attempts'] = [];
result.attempts = mutableAttempts;
result.latestSignerAttempt!.startedAtMs = 0;
const runAsString: string = result.latestSignerAttempt!.run;
const status: boolean = result.latestSignerAttempt!.job;
const invalidListRuns: OwnerAmendmentSemanticProducerAttemptsInput['listRuns'] = async (input: { page: string }) => external;
assertMissingOwnerAmendmentTagHasNoSuccessfulSigner({ hasSuccessfulSignerBeforeQueue: external });
void [invalidListRuns, status, runAsString];
