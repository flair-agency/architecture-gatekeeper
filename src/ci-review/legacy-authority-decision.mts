// Partial migration: preparation, Git/filesystem sinks and CLI remain flat and untyped.
type DecisionOperation = { decision?: unknown; authorityFiles: unknown[] };
type ProvenanceOperation = { members: { length: unknown; some(callback: (member: unknown) => unknown): unknown } };

/** Preserve the existing exact base-selected path check; this is not semantic validation. */
export function validateLegacyAuthorityDecision(decisionJson: unknown, provenance: unknown): unknown {
  const decision: unknown = JSON.parse(decisionJson as string);
  if (!['PASS', 'BLOCK', 'OWNER_DECISION'].includes((decision as DecisionOperation | null)?.decision as string) || !Array.isArray((decision as DecisionOperation).authorityFiles) ||
      (decision as DecisionOperation).authorityFiles.length !== (provenance as ProvenanceOperation).members.length ||
      new Set((decision as DecisionOperation).authorityFiles).size !== (decision as DecisionOperation).authorityFiles.length ||
      (provenance as ProvenanceOperation).members.some(member => !(decision as DecisionOperation).authorityFiles.includes((member as { path: unknown }).path))) {
    throw new Error('Legacy review did not report the exact base-selected authorityFiles.');
  }
  return decision;
}
