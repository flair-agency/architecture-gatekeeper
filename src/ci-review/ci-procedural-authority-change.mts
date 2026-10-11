import { execFileSync } from 'node:child_process';
import { validateMultiAuthorityProvenance } from '../authority-validation/multi-authority-provenance.mts';

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

type ProvenanceReadView = {
  selfRepository: unknown;
  authorityRevision: unknown;
  members: Array<{ repository: unknown; path: unknown }>;
};
// These erased views model the original property reads; provenance remains caller-owned and is reread.
type GitOutput = Readonly<{ toString: (encoding: 'utf8') => string; then?: never }>;
export type GitExecFile = (file: 'git', args: readonly unknown[], options: Readonly<{
  cwd: string | URL;
  encoding: 'buffer';
  maxBuffer: 1_000_000;
}>) => GitOutput;

export type ChangedSelectedAuthorityPathsInput = Readonly<{
  provenance: unknown;
  repository: unknown;
  baseSha: unknown;
  headSha: unknown;
  cwd?: string | URL;
  execFile?: GitExecFile;
}>;

/** Return selected same-repository Authority Set members changed by this candidate. */
export function changedSelectedAuthorityPaths({ provenance, repository, baseSha, headSha, cwd = process.cwd(),
  // The native command validates path arguments at runtime; this erased view does not certify reread members as strings.
  execFile = execFileSync as unknown as GitExecFile }: ChangedSelectedAuthorityPathsInput): string[] {
  validateMultiAuthorityProvenance(provenance);
  if ((provenance as ProvenanceReadView).selfRepository !== repository ||
      (provenance as ProvenanceReadView).authorityRevision !== baseSha ||
      !SHA.test(baseSha as string) || !SHA.test(headSha as string) ||
      (baseSha as { length: unknown }).length !== (headSha as { length: unknown }).length) {
    throw new Error('Procedural authority-change comparison does not match the recorded base and repository.');
  }
  const selectedPaths = (provenance as ProvenanceReadView).members.filter(member => member.repository === repository)
    .map(member => member.path);
  if (!selectedPaths.length) throw new Error('Selected Authority Set has no same-repository authority to compare.');
  const changed = execFile('git', ['diff', '--name-only', '-z', '--no-renames', baseSha as string, headSha as string, '--', ...selectedPaths],
    { cwd, encoding: 'buffer', maxBuffer: 1_000_000 }).toString('utf8').split('\0').filter(Boolean);
  if (changed.some(path => !selectedPaths.includes(path))) throw new Error('Git returned a path outside the selected Authority Set.');
  return changed;
}
