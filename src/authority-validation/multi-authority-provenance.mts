import { createHash } from 'node:crypto';
import { validateAuthoritySetDecision } from '../authority-set.mjs';

const SHA = /^[a-f0-9]{40}$/;
const DIGEST = /^[a-f0-9]{64}$/;
const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
function fail(): never { throw new Error('Multi-document Authority Set provenance is invalid or mismatched.'); }
function keys(value: unknown, expected: readonly string[]): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      Object.keys(value).length !== expected.length || expected.some(key => !Object.hasOwn(value, key))) fail();
}

export interface MultiAuthorityMember {
  id: string;
  repository: string;
  resolvedCommit: string;
  path: string;
  byteLength: number;
  sha256: string;
}

/** Operational same-run metadata; this shape is not independent acceptance evidence. */
export interface MultiAuthorityProvenance {
  version: 2;
  selfRepository: string;
  authorityRevision: string;
  manifestSha256: string;
  setDigest: string;
  members: MultiAuthorityMember[];
}

export interface MaterializedMultiAuthorityMember extends MultiAuthorityMember {
  content?: unknown;
}

export interface MaterializedMultiAuthoritySet {
  manifestSha256: string;
  setDigest: string;
  members: MaterializedMultiAuthorityMember[];
}

/** Validate same-run snapshot metadata, not independent acceptance evidence. */
export function validateMultiAuthorityProvenance<T>(value: T): T {
  keys(value, ['version', 'selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest', 'members']);
  if (value.version !== 2 || !REPOSITORY.test(value.selfRepository as string) || !SHA.test(value.authorityRevision as string) ||
      !DIGEST.test(value.manifestSha256 as string) || !DIGEST.test(value.setDigest as string) ||
      !Array.isArray(value.members) || !value.members.length || value.members.length > 32) fail();
  const ids = new Set<string>();
  let total = 0;
  const records = value.members.map((member: unknown) => {
    keys(member, ['id', 'repository', 'resolvedCommit', 'path', 'byteLength', 'sha256']);
    if (typeof member.id !== 'string' || !/^[a-z][a-z0-9-]{0,63}$/.test(member.id) || ids.has(member.id) ||
        typeof member.repository !== 'string' || !REPOSITORY.test(member.repository) || !SHA.test(member.resolvedCommit as string) ||
        typeof member.path !== 'string' || (member.path as string).length > 240 ||
        !/^(?:[A-Za-z0-9._-]+\/)*[A-Za-z0-9._-]+\.md$/.test(member.path as string) ||
        (member.path as string).split('/').some((part: string) => part === '.' || part === '..') || !DIGEST.test(member.sha256 as string) ||
        !Number.isSafeInteger(member.byteLength) || (member.byteLength as number) < 1 || (member.byteLength as number) > 262_144 ||
        (member.repository === value.selfRepository && member.resolvedCommit !== value.authorityRevision)) fail();
    ids.add(member.id as string);
    total += member.byteLength as number;
    return { id: member.id, repository: member.repository, resolvedCommit: member.resolvedCommit,
      path: member.path, byteLength: member.byteLength, sha256: member.sha256 };
  });
  if (total > 524_288 || createHash('sha256').update(JSON.stringify(records)).digest('hex') !== value.setDigest) fail();
  return value;
}

export function assertSameMultiAuthorityProvenance(actual: unknown, expected: unknown): void {
  validateMultiAuthorityProvenance(actual);
  validateMultiAuthorityProvenance(expected);
  for (const key of ['selfRepository', 'authorityRevision', 'manifestSha256', 'setDigest']) {
    if ((actual as Record<string, unknown>)[key] !== (expected as Record<string, unknown>)[key]) fail();
  }
}

export function validateMultiAuthorityDecision<TDecision, TProvenance>(decision: TDecision, provenance: TProvenance): TDecision {
  validateMultiAuthorityProvenance(provenance);
  validateAuthoritySetDecision(decision, provenance);
  if ((decision as Record<string, unknown>).authoritySetDigest !== (provenance as Record<string, unknown>).setDigest) fail();
  return decision;
}

export function multiAuthorityProvenance(materialized: MaterializedMultiAuthoritySet, repository: string,
  baseSha: string): MultiAuthorityProvenance {
  return validateMultiAuthorityProvenance({ version: 2, selfRepository: repository, authorityRevision: baseSha,
    manifestSha256: materialized.manifestSha256, setDigest: materialized.setDigest,
    members: materialized.members.map(({ content, ...member }) => member) });
}
