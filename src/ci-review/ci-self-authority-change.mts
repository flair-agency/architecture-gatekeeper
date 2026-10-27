import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { materializeAuthoritySet, readCommittedAuthorityFile } from '../authority-set.mts';
import { parseCiPolicyJson, resolveCiPolicy } from '../resolve-ci-policy.mts';
import { validateRepositoryTreePath } from '../runner-temp-path.mts';
import { changedSelectedAuthorityPaths } from './ci-procedural-authority-change.mts';

const SHA = /^[a-f0-9]{40}$/;
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const fail: (message: string) => never = message => { throw new Error(`Self Authority comparison: ${message}`); };
export interface SelfAuthorityChangeInput {
  repository: string | undefined;
  baseSha: string | undefined;
  headSha: string | undefined;
  reviewedSha: string | undefined;
  baseBranch: string | undefined;
  policyPath: string | undefined;
  policySha256: string | undefined;
  provenance: unknown;
  cwd: string;
}

/** Same-run classification only. Neither a model decision nor a tag selects these paths. */
export async function inspectSelfAuthorityChanges(input: SelfAuthorityChangeInput) {
  const { repository, baseSha, headSha, reviewedSha, baseBranch, policyPath, policySha256, cwd } = input;
  if (repository !== 'flair-agency/architecture-gatekeeper' || baseBranch !== 'main' ||
      typeof baseSha !== 'string' || !SHA.test(baseSha) || typeof headSha !== 'string' || !SHA.test(headSha) ||
      typeof reviewedSha !== 'string' || !SHA.test(reviewedSha) ||
      typeof policySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(policySha256)) fail('exact protected self input is required.');
  const validatedPolicyPath = validateRepositoryTreePath(policyPath);
  const git = (args: readonly string[]) => execFileSync('git', ['--no-replace-objects', ...args],
    { cwd, encoding: 'buffer', maxBuffer: 1_000_000, timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const sha of [baseSha, headSha, reviewedSha]) {
    if (git(['cat-file', '-t', sha]).toString('ascii').trim() !== 'commit') fail('input is not a commit.');
  }
  const parents = git(['rev-list', '--parents', '-n', '1', reviewedSha]).toString('ascii').trim().split(' ');
  if (parents.length !== 3 || parents[0] !== reviewedSha || parents[1] !== baseSha || parents[2] !== headSha) {
    fail('reviewed merge does not match the exact ordered base/head parents.');
  }
  const policyBytes = readCommittedAuthorityFile(cwd, baseSha, validatedPolicyPath, 65_536);
  if (hash(policyBytes) !== policySha256) fail('recorded-base policy digest mismatch.');
  const policy = resolveCiPolicy(parseCiPolicyJson(policyBytes.toString('utf8')), baseBranch);
  if (policy.mode !== 'enforced' || typeof policy.authorityManifestPath !== 'string' || !policy.authorityLimitsBase64) {
    fail('old policy must select enforced review and a complete Authority Set.');
  }
  const limits = JSON.parse(Buffer.from(policy.authorityLimitsBase64, 'base64').toString('utf8'));
  const manifestBytes = readCommittedAuthorityFile(cwd, baseSha, policy.authorityManifestPath, limits.maxManifestBytes);
  // Reuse the complete base materializer: absent members, non-regular files, limits and digest failures reject.
  // No external source is silently omitted; unsupported self selections fail before returning a result.
  const materialized = await materializeAuthoritySet({ manifestBytes, limits, selfRepository: repository,
    selfRoot: cwd, authorityRevision: baseSha, profile: policy.authorityProfile ?? 'v1' });
  const expected = { version: policy.authorityProfile === 'owner-addition-v2' ? 2 : 1,
    selfRepository: repository, authorityRevision: baseSha, manifestSha256: materialized.manifestSha256,
    setDigest: materialized.setDigest, members: materialized.members.map(({ content, ...member }) => member) };
  if (JSON.stringify(input.provenance) !== JSON.stringify(expected)) fail('review provenance differs from the complete old selection.');
  // v2 here is the existing internal comparison metadata shape, not a Policy/profile upgrade.
  const comparison = { ...expected, version: 2 };
  const paths = changedSelectedAuthorityPaths({ provenance: comparison, repository, baseSha, headSha, cwd,
    execFile: (_file, args) => {
      const bytes = git(args as string[]);
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (text && !text.endsWith('\0')) fail('truncated Git path comparison.');
      return bytes;
    } });
  // A config-only migration is reviewed under the OLD selection. This diagnostic is not migration authorization.
  const configurationPaths = [validatedPolicyPath, policy.authorityManifestPath].filter(path =>
    git(['diff', '--name-only', '-z', '--no-renames', baseSha, headSha, '--', path]).length > 0);
  return Object.freeze({ changed: paths.length > 0, paths: Object.freeze(paths),
    configurationPaths: Object.freeze(configurationPaths) });
}
