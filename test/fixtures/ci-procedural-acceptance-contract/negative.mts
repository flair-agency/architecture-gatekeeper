import { assertProceduralV5Acceptance } from '../../../src/ci-review/ci-procedural-acceptance.mts';

// @ts-expect-error All five routing observations are required inputs.
assertProceduralV5Acceptance({ policyVersion: '5', evidenceProducer: 'github-actions', reviewResult: 'success',
  conclusion: 'PASS' });
