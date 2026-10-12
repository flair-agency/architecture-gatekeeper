const reject = (message: string): never => { throw new Error(`Invalid measurement dataset: ${message}`); };
// The production boundary accepts plain JSON exports (at most 256 KiB per
// record), not arbitrary objects with accessors or custom prototypes. Cap
// traversal to cover every value in that record bound. Object key order is
// serialization detail; array order and primitive types remain data.
export function sameEnvelopeValue(left: unknown, right: unknown): boolean {
  let budget = 256 * 1024;
  const equal = (a: unknown, b: unknown, depth: number): boolean => {
    if (--budget < 0) throw new Error('Measurement phase metadata exceeds comparison budget.');
    if (depth > 32) throw new Error('Measurement phase metadata exceeds comparison depth.');
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) || Array.isArray(b)) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
      if (a.length > budget) throw new Error('Measurement phase metadata exceeds comparison budget.');
      for (let i = 0; i < a.length; i++) if (!equal(a[i], b[i], depth + 1)) return false;
      return true;
    }
    const ak = Object.keys(a); const bk = Object.keys(b);
    if (ak.length > budget || bk.length > budget) throw new Error('Measurement phase metadata exceeds comparison budget.');
    ak.sort(); bk.sort();
    if (ak.length !== bk.length || ak.some((key, i) => key !== bk[i])) return false;
    return ak.every(key => equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], depth + 1));
  };
  return equal(left, right, 0);
}
export const MEASUREMENT_ENVELOPE_FIELDS = ['version', 'kind', 'attemptId', 'route', 'startedAt', 'changeId', 'repositoryId', 'sessionId', 'correlation', 'runtime', 'context', 'ci'] as const;
const REDACTED_REQUEST_FIELDS = ['requestId', 'promptSha256', 'schemaSha256', 'authorityProvenanceSha256', 'policySha256', 'reviewedRevision', 'snapshotSha256', 'scopeKind'] as const;

type PhaseRecord = { attemptId: string; phase: string };
/** Shared by dataset assembly and private-record resumption. */
export function validateMeasurementPhases(records: readonly PhaseRecord[]): void {
  const envelopes = new Map<string, { values: Record<string, unknown>; present: Set<string> }>();
  const phasesByAttempt = new Map<string, Map<string, PhaseRecord>>();
  for (const record of records) {
    const phases = phasesByAttempt.get(record.attemptId) || new Map<string, PhaseRecord>();
    const duplicate = phases.get(record.phase);
    if (duplicate && !sameEnvelopeValue(duplicate, record)) reject('conflicting duplicate phase observations');
    if (!duplicate) phases.set(record.phase, record);
    phasesByAttempt.set(record.attemptId, phases);
    const envelope = record as unknown as Record<string, unknown>;
    const prior = envelopes.get(record.attemptId);
    if (!prior) {
      const values: Record<string, unknown> = {}; const present = new Set<string>();
      for (const field of MEASUREMENT_ENVELOPE_FIELDS) if (Object.hasOwn(envelope, field)) { values[field] = envelope[field]; present.add(field); }
      envelopes.set(record.attemptId, { values, present });
      continue;
    }
    for (const field of MEASUREMENT_ENVELOPE_FIELDS) {
      const present = Object.hasOwn(envelope, field);
      if (prior.present.has(field) !== present) reject('conflicting phase metadata');
      if (!present) continue;
      if (!sameEnvelopeValue(prior.values[field], envelope[field])) reject('conflicting phase metadata');
    }
  }
  for (const phases of phasesByAttempt.values()) {
    const prepared = phases.get('prepared') as (PhaseRecord & Record<string, unknown>) | undefined;
    const terminal = phases.get('terminal') as (PhaseRecord & Record<string, unknown>) | undefined;
    if (!prepared || !terminal) continue;
    const hasPreparedRequest = Object.hasOwn(prepared, 'request');
    const hasTerminalRequest = Object.hasOwn(terminal, 'request');
    if (hasPreparedRequest !== hasTerminalRequest ||
        (hasPreparedRequest && !sameEnvelopeValue(prepared.request, terminal.request))) reject('conflicting phase request metadata');
    for (const field of REDACTED_REQUEST_FIELDS) {
      const preparedHasField = Object.hasOwn(prepared, field);
      const terminalHasField = Object.hasOwn(terminal, field);
      if (preparedHasField !== terminalHasField ||
          (preparedHasField && !sameEnvelopeValue(prepared[field], terminal[field]))) reject('conflicting phase request metadata');
    }
  }
}
