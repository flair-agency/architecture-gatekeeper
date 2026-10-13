import { sameEnvelopeValue, validateMeasurementPhases } from './measurement-consistency.mts';
import { measurementDigest, parseMeasurementJson, validateMeasurementRecord } from './measurement.mts';
import type { MeasurementRecord } from './measurement.mts';

// Validated classification values remain separate from unauthenticated evidence.
export interface MeasurementChange {
  changeId: string; eligible: boolean; cohort: string; domain: string;
  initialRef?: unknown; finalRef?: unknown;
}
export interface MeasurementCase {
  caseId: string; changeId: string; kind: string; adjudication: string; disposition: string;
  findingRefs: Array<{ attemptId: string; index: number }>; evidence: unknown[];
  adjudicator?: unknown; initialRef?: unknown; finalRef?: unknown; authorityRef?: unknown;
  resolvedBeforeCI?: unknown;
}
export interface MeasurementAudit {
  changeId: string; blinded: boolean; auditor: unknown; initialRef: unknown;
  finalRef: unknown; authorityRef: unknown; evidence: unknown[];
  initialViolationCaseIds: string[]; finalViolationCaseIds: string[];
}
export interface MeasurementDataset {
  version: number; records: MeasurementRecord[]; population: MeasurementChange[];
  cases: MeasurementCase[]; audits: MeasurementAudit[]; plan?: unknown; collectionGaps?: unknown;
}
export interface MeasurementCohort { cohort?: string; domain?: string }
export interface MeasurementSampleOptions extends MeasurementCohort { seed: string; count: number }
// Operation-only view of unchecked observations; exported datasets retain unknowns.
type ObservationView = MeasurementRecord & {
  startedAt: string; completedAt?: string; state?: string;
  request?: { scope?: { kind?: unknown } };
};
// A 256 KiB private JSON record cannot hold more one-byte finding values
// separated by commas, even before counting its mandatory wrapper.
const MAX_REPORTED_FINDINGS = Math.floor((256 * 1024 - 2) / 2);
const decisionView = (value: unknown) => value as { decision?: unknown; findings?: unknown[] } | null | undefined;

const enumValue = (value: unknown, allowed: readonly unknown[]) => allowed.includes(value);
const rate = (numerator: number, denominator: number) => ({ numerator, denominator, rate: denominator ? numerator / denominator : null });
const identity = (value: unknown) => typeof value === 'string' && value.length <= 200 && /[^\s\p{Cf}\p{Default_Ignorable_Code_Point}]/u.test(value) && !/\p{Cc}/u.test(value);
const reference = identity;
const optionalReference = (value: unknown) => value === undefined || value === null || reference(value);
const list = (value: unknown) => Array.isArray(value) && value.length <= 10000;
const reject = (message: string): never => { throw new Error(`Invalid measurement dataset: ${message}`); };
function populationChanges(population: MeasurementChange[]) {
  const changes = new Map<string, MeasurementChange>();
  for (const change of population) {
    // Copy only packet metadata once; caller accessors cannot replace a checked
    // reference with structured outcome fields during later packet mapping.
    const view = { changeId: change.changeId, eligible: change.eligible, cohort: change.cohort, domain: change.domain,
      initialRef: change.initialRef ?? null, finalRef: change.finalRef ?? null };
    if (!identity(view.changeId) || changes.has(view.changeId) || typeof view.eligible !== 'boolean' ||
        !enumValue(view.cohort, ['natural', 'fixture']) || !enumValue(view.domain, ['self', 'consumer'])) reject('population identity/cohort');
    if (!optionalReference(view.initialRef) || !optionalReference(view.finalRef)) reject('population reference');
    changes.set(view.changeId, view);
  }
  return changes;
}
// The object API has the same whole-dataset JSON boundary as the CLI. Inspect
// descriptors before serialization so accessors/toJSON cannot replace checked
// values. Optional undefined object fields use JSON's ordinary omission rule.
function datasetSnapshot(value: unknown): MeasurementDataset {
  let budget = 256 * 1024;
  const visit = (item: unknown, depth: number): unknown => {
    if (--budget < 0) reject('JSON limit');
    if (depth > 32) reject('JSON depth limit');
    if (item === null || typeof item === 'boolean' || item === undefined) return item;
    if (typeof item === 'string') { budget -= Buffer.byteLength(item); if (budget < 0) reject('JSON limit'); return item; }
    if (typeof item === 'number' && Number.isFinite(item)) return item;
    if (typeof item !== 'object') reject('JSON shape');
    const prototype = Object.getPrototypeOf(item);
    const array = Array.isArray(item);
    if (array ? prototype !== Array.prototype : prototype !== Object.prototype && prototype !== null) reject('JSON shape');
    const copy = (array ? [] : Object.create(null)) as Record<string, unknown>;
    if (array && (item as unknown[]).length > budget) reject('JSON limit');
    // Sparse/non-enumerable indices cannot disappear when copied to a JSON array.
    if (array) for (let i = 0; i < (item as unknown[]).length; i++) {
      const property = Object.getOwnPropertyDescriptor(item, String(i));
      if (!property || !Object.hasOwn(property, 'value') || !property.enumerable) reject('JSON shape: sparse array');
    }
    const keys = Reflect.ownKeys(item as object);
    if (keys.length > budget) reject('JSON limit');
    for (const key of keys) {
      const property = Object.getOwnPropertyDescriptor(item, key)!;
      if (!Object.hasOwn(property, 'value')) reject('JSON shape: accessors');
      if (!property.enumerable) continue;
      if (typeof key !== 'string') return reject('JSON shape: symbol');
      if (!array) budget -= Buffer.byteLength(key); if (budget < 0) reject('JSON limit');
      copy[key] = visit(property.value, depth + 1);
    }
    return copy;
  };
  return parseMeasurementJson(JSON.stringify(visit(value, 0))) as MeasurementDataset;
}
export function validateMeasurementDataset(value: unknown): MeasurementDataset {
  const data = datasetSnapshot(value);
  if (data?.version !== 1 || !['records', 'population', 'cases', 'audits'].every(key => list(data[key as keyof MeasurementDataset]))) reject('version/collections');
  if (data.collectionGaps !== undefined && data.collectionGaps !== null &&
      (!Number.isSafeInteger(data.collectionGaps) || (data.collectionGaps as number) < 0)) reject('collection gap count');
  const observations = new Map<string, MeasurementRecord>();
  const normalizedRecords: MeasurementRecord[] = [];
  for (const record of data.records) {
    validateMeasurementRecord(record);
    if (record.findingCount !== undefined && record.findingCount !== null &&
        (!Number.isSafeInteger(record.findingCount) || (record.findingCount as number) < 0 || (record.findingCount as number) > MAX_REPORTED_FINDINGS)) reject('finding reference: invalid finding count');
    const key = `${record.attemptId}.${record.phase}`;
    const duplicate = observations.get(key);
    if (duplicate) {
      if (!sameEnvelopeValue(duplicate, record)) reject('conflicting duplicate observation');
      continue;
    }
    observations.set(key, record);
    normalizedRecords.push(record);
  }
  const normalizedData = normalizedRecords.length === data.records.length ? data : { ...data, records: normalizedRecords };
  validateMeasurementPhases(normalizedRecords);
  const changes = populationChanges(data.population);
  const terminals = new Map(normalizedData.records.filter(r => r.phase === 'terminal').map(r => [r.attemptId, r]));
  const cases = new Map(); const linkedFindings = new Set();
  for (const item of data.cases) {
    if (!identity(item.caseId) || cases.has(item.caseId) || !changes.has(item.changeId) ||
        !enumValue(item.kind, ['architecture-violation', 'proposed-task', 'authorized-evolution', 'ordinary-bug']) ||
        !enumValue(item.adjudication, ['valid', 'false-positive', 'unresolved']) ||
        !enumValue(item.disposition, ['corrected', 'withdrawn', 'integrated-violation', 'authorized-evolution', 'rejected-proposal', 'unresolved']) ||
        !list(item.findingRefs) || !list(item.evidence)) reject('case identity/classification');
    if (item.resolvedBeforeCI !== undefined && item.resolvedBeforeCI !== null && typeof item.resolvedBeforeCI !== 'boolean') reject('resolution timing boolean');
    if (![item.initialRef, item.finalRef, item.authorityRef].every(optionalReference)) reject('case reference');
    if (!item.evidence.every(reference)) reject('case evidence reference');
    if (item.adjudication !== 'unresolved' && (!identity(item.adjudicator) || !item.evidence.length)) reject('adjudication needs explicit assessor/evidence');
    if (item.disposition !== 'unresolved' && (!reference(item.initialRef) || !reference(item.finalRef) || !reference(item.authorityRef) || !item.evidence.length)) reject('known disposition needs initial/final/authority references and evidence');
    for (const ref of item.findingRefs) {
      const findingIdentity = `${ref.attemptId}/${ref.index}`;
      if (linkedFindings.has(findingIdentity)) reject('finding assigned more than once');
      linkedFindings.add(findingIdentity);
      const r = terminals.get(ref.attemptId);
      const privateDecision = decisionView(r?.decision);
      const privateCount = Array.isArray(privateDecision?.findings) ? privateDecision.findings.length : undefined;
      const count = r?.findingCount ?? privateCount;
      const decision = typeof r?.decision === 'string' ? r.decision : privateDecision?.decision;
      if (!r || r.route === 'ci-outcome' || !enumValue(decision, ['PASS', 'BLOCK', 'OWNER_DECISION']) ||
          (r.findingCount !== undefined && privateCount !== undefined && r.findingCount !== privateCount) || r.state !== 'completed' || !Number.isSafeInteger(ref.index) || ref.index < 0 || !Number.isSafeInteger(count) || (count as number) > MAX_REPORTED_FINDINGS || ref.index >= (count as number) || (r.changeId && r.changeId !== item.changeId)) reject('finding reference');
    }
    cases.set(item.caseId, item);
  }
  const audited = new Set();
  for (const audit of data.audits) {
    if (!changes.has(audit.changeId) || audited.has(audit.changeId) || typeof audit.blinded !== 'boolean' || !identity(audit.auditor) ||
        !reference(audit.initialRef) || !reference(audit.finalRef) || !reference(audit.authorityRef) || !list(audit.evidence) || !audit.evidence.length || !audit.evidence.every(reference) ||
        !list(audit.initialViolationCaseIds) || !list(audit.finalViolationCaseIds)) reject('audit evidence/identity');
    const sampled = changes.get(audit.changeId)!;
    for (const field of ['initialRef', 'finalRef'] as const) {
      if (sampled[field] !== null && sampled[field] !== audit[field]) reject('audit sampled revision reference');
    }
    audited.add(audit.changeId);
    for (const id of [...audit.initialViolationCaseIds, ...audit.finalViolationCaseIds]) {
      const item = cases.get(id);
      if (!item || item.changeId !== audit.changeId || item.kind !== 'architecture-violation' || item.adjudication !== 'valid') reject('audit case');
    }
    for (const id of audit.finalViolationCaseIds) {
      if (cases.get(id)?.disposition !== 'integrated-violation') reject('final audit disposition');
    }
    const finalCases = new Set(audit.finalViolationCaseIds);
    for (const item of cases.values()) {
      if (item.changeId === audit.changeId && item.kind === 'architecture-violation' && item.adjudication === 'valid' &&
          item.disposition === 'integrated-violation' && !finalCases.has(item.caseId)) reject('final audit omits integrated violation');
    }
    if (new Set(audit.initialViolationCaseIds).size !== audit.initialViolationCaseIds.length || new Set(audit.finalViolationCaseIds).size !== audit.finalViolationCaseIds.length) reject('duplicate audit case');
  }
  return normalizedData;
}
/** Fixed eligible population and seed, with review outcomes absent from the audit packet. */
export function sampleMeasurementPopulation(value: unknown, { seed, count, cohort = 'natural', domain = 'self' }: MeasurementSampleOptions) {
  const data = validateMeasurementDataset(value);
  if (!enumValue(cohort, ['natural', 'fixture']) || !enumValue(domain, ['self', 'consumer'])) reject('cohort/domain');
  if (!identity(seed) || !Number.isSafeInteger(count) || count < 1 || count > 10000) reject('sample seed/count');
  const eligible = [...populationChanges(data.population).values()].filter(c => c.eligible && c.cohort === cohort && c.domain === domain);
  return { version: 1, seed, sampling: 'deterministic SHA-256 rank; freeze population before adjudication', eligible: eligible.length,
    sample: eligible.map(c => ({ change: c, rank: measurementDigest(`${seed}\n${c.changeId}`) })).sort((a, b) => a.rank.localeCompare(b.rank)).slice(0, count)
      .map(({ change }) => ({ changeId: change.changeId, initialRef: change.initialRef || null, finalRef: change.finalRef || null })) };
}
export function aggregateMeasurement(value: unknown, { cohort = 'natural', domain = 'self' }: MeasurementCohort = {}) {
  const data = validateMeasurementDataset(value);
  if (!enumValue(cohort, ['natural', 'fixture']) || !enumValue(domain, ['self', 'consumer'])) reject('cohort/domain');
  const population = data.population.filter(c => c.eligible && c.cohort === cohort && c.domain === domain);
  const changes = new Set<unknown>(population.map(c => c.changeId));
  const declaredChanges = new Set<unknown>(data.population.map(c => c.changeId));
  const cases = data.cases.filter(c => changes.has(c.changeId));
  const audits = data.audits.filter(a => changes.has(a.changeId));
  const events = (data.records as ObservationView[]).filter(r => r.route !== 'ci-outcome');
  const starts = new Map(events.filter(r => r.phase === 'start').map(r => [r.attemptId, r]));
  const prepared = new Map(events.filter(r => r.phase === 'prepared').map(r => [r.attemptId, r]));
  const terminals = new Map(events.filter(r => r.phase === 'terminal').map(r => [r.attemptId, r]));
  const attempts = [...new Set([...starts.keys(), ...prepared.keys(), ...terminals.keys()])]
    .map(id => (terminals.get(id) || prepared.get(id) || starts.get(id))!).filter(r => changes.has(r.changeId));
  const detected = (c: MeasurementCase) => c.findingRefs.length > 0;
  const violation = cases.filter(c => c.kind === 'architecture-violation');
  const adjudicated = violation.filter(c => detected(c) && c.adjudication !== 'unresolved');
  const valid = violation.filter(c => c.adjudication === 'valid');
  const known = valid.filter(c => detected(c) && ['corrected', 'withdrawn', 'integrated-violation'].includes(c.disposition));
  const resolved = known.filter(c => ['corrected', 'withdrawn'].includes(c.disposition));
  const initial = [...new Set(audits.flatMap(a => a.initialViolationCaseIds))];
  const initialDetected = initial.filter(id => detected(cases.find(c => c.caseId === id)!));
  // Detection becomes observable when a completed result is available, not
  // when execution begins. Equal earliest local/CI times establish no order.
  const firstDetection = (c: MeasurementCase) => {
    const refs = c.findingRefs.map(f => terminals.get(f.attemptId)).filter((r): r is ObservationView => r !== undefined);
    if (!refs.length) return 'unknown';
    const earliest = Math.min(...refs.map(r => Date.parse(r.completedAt as string)));
    const routes = new Set(refs.filter(r => Date.parse(r.completedAt as string) === earliest)
      .map(r => r.route.startsWith('ci-') ? 'ci' : 'local'));
    return routes.size > 1 ? 'ambiguous' : routes.has('local') ? 'local' : 'ci';
  };
  const firstDetections = new Map(cases.map(c => [c.caseId, firstDetection(c)]));
  const allResolved = valid.filter(c => ['corrected', 'withdrawn'].includes(c.disposition));
  const local = allResolved.filter(c => c.resolvedBeforeCI === true && firstDetections.get(c.caseId) === 'local');
  const states: Record<string, number> = {}; const scopeCounts = new Map<string, number>();
  for (const r of attempts) { const state = r.phase === 'terminal' ? r.state as string : 'missing'; states[state] = (states[state] || 0) + 1; }
  for (const r of attempts.filter(r => r.phase === 'terminal' && r.state === 'completed')) { const observedScope = r.scopeKind ?? r.request?.scope?.kind; const scope = identity(observedScope) ? observedScope as string : 'unknown'; scopeCounts.set(scope, (scopeCounts.get(scope) || 0) + 1); }
  const reviewed = new Set(attempts.filter(r => r.phase === 'terminal' && r.state === 'completed' &&
    enumValue(typeof r.decision === 'string' ? r.decision : decisionView(r.decision)?.decision, ['PASS', 'BLOCK', 'OWNER_DECISION'])).map(r => r.changeId));
  const observed = new Set(attempts.map(r => r.changeId));
  const latency = attempts.filter(r => r.phase === 'terminal').map(r => Date.parse(r.completedAt as string) - Date.parse(r.startedAt)).filter(n => n >= 0).sort((a, b) => a - b);
  const middleLatency = Math.floor(latency.length / 2);
  const medianElapsedMs = !latency.length ? null : latency.length % 2
    ? latency[middleLatency] : latency[middleLatency - 1] + (latency[middleLatency] - latency[middleLatency - 1]) / 2;
  return { version: 1, cohort, domain, plan: data.plan || null, interpretation: 'Observed detection and adjudicated resolution only; no causal prevention estimate. Sample rates do not estimate a population without a justified sampling plan.',
    metrics: { precision: rate(adjudicated.filter(c => c.adjudication === 'valid').length, adjudicated.length),
      validFindingResolution: rate(resolved.length, known.length),
      integratedDriftIncidence: rate(audits.filter(a => a.finalViolationCaseIds.length > 0).length, audits.length),
      recall: rate(initialDetected.length, initial.length), localEarlyResolution: rate(local.length, allResolved.length) },
    counts: { eligibleChanges: population.length, auditedChanges: audits.length, blindedAudits: audits.filter(a => a.blinded).length,
      unresolvedCases: cases.filter(c => c.adjudication === 'unresolved' || c.disposition === 'unresolved').length,
      authorizedEvolution: cases.filter(c => c.kind === 'authorized-evolution' || c.disposition === 'authorized-evolution').length,
      proposedTasks: cases.filter(c => c.kind === 'proposed-task').length, ordinaryBugs: cases.filter(c => c.kind === 'ordinary-bug').length,
      validDetectedCases: valid.filter(detected).length, knownFinalValidCases: known.length,
      ambiguousFirstDetectionCases: resolved.filter(c => firstDetections.get(c.caseId) === 'ambiguous').length },
    coverage: { eligible: population.length, reviewed: reviewed.size, observed: observed.size, noObservation: population.length - observed.size,
      attempts: attempts.length, states, completedByScope: Object.fromEntries(scopeCounts), collectionGaps: Number.isSafeInteger(data.collectionGaps) && (data.collectionGaps as number) >= 0 ? data.collectionGaps as number : null, unlinkedAttempts: [...new Set(events.filter(r => !declaredChanges.has(r.changeId)).map(r => r.attemptId))].length,
      terminalWithoutStart: attempts.filter(r => r.phase === 'terminal' && !starts.has(r.attemptId)).length, delivery: 'unknown', agentResponse: 'unknown' },
    overhead: { latencySamples: latency.length, medianElapsedMs,
      repeatedAttempts: attempts.length - observed.size, developerWaiting: 'unknown', attributableUsage: 'unknown', cost: 'unknown' },
    cases: cases.map(c => ({ caseId: c.caseId, changeId: c.changeId, adjudication: c.adjudication, disposition: c.disposition, firstDetection: firstDetections.get(c.caseId), repeats: Math.max(0, c.findingRefs.length - 1) })) };
}
