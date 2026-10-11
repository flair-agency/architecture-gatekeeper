import { prepare, resolveSingleOwnerAdditionAuthorityId, type OwnerAdditionCiEnvironment } from '../../../src/owner-addition/owner-addition-ci.mts';
import { resolveSingleOwnerAdditionAuthorityId as flatResolve } from '../../../src/owner-addition-ci.mjs';
import { resolveCiPolicy } from '../../../src/authority-validation/resolve-ci-policy.mts';
import { validateOwnerAdditionEligibility } from '../../../src/owner-addition/owner-addition-validation.mts';

const environment: OwnerAdditionCiEnvironment = {
  GITHUB_WORKSPACE: '/checkout',
  GITHUB_REPOSITORY: 'example/project',
  BASE_SHA: 'a'.repeat(40),
  HEAD_SHA: 'b'.repeat(40),
  BASE_BRANCH: 'main',
  POLICY_PATH: 'docs/policy.json',
  ORDINARY_SCHEMA_PATH: 'schemas/review.json',
  OUTPUT_DIR: '/tmp/owner-addition',
};
const readonlyEnvironment = {
  GITHUB_WORKSPACE: '/checkout',
  GITHUB_REPOSITORY: 'example/project',
  BASE_SHA: 'a'.repeat(40),
  HEAD_SHA: 'b'.repeat(40),
  BASE_BRANCH: 'main',
  POLICY_PATH: 'docs/policy.json',
  ORDINARY_SCHEMA_PATH: 'schemas/review.json',
  OUTPUT_DIR: '/tmp/owner-addition',
} as const;
prepare(environment);
prepare(readonlyEnvironment);

const selected = resolveCiPolicy(JSON.parse('{"version":1}'), 'main');
resolveSingleOwnerAdditionAuthorityId('/checkout', 'a'.repeat(40), selected, 'docs/architecture.md');
flatResolve('/checkout', 'a'.repeat(40), selected, 'docs/architecture.md');

const externalJson: unknown = JSON.parse('{"eligibility":true}');
void externalJson;
const decision = validateOwnerAdditionEligibility('not trusted by its TypeScript type alone', {});
const eligibility: boolean = decision.eligible;
void eligibility;
