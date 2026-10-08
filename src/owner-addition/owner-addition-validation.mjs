// Shared OWNER_ADDITION validators used by both the CI adapter and multi-authority flow.
const REQUIRED_CHECKS = [
    'eligible', 'onlyMissingDecision', 'preservesExistingRules',
    'noContradiction', 'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices',
    'matchesOrdinaryOwnerDecision',
];
const DECISION_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;
export function validateOwnerAdditionEligibilitySchema(schema) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
        schema.type !== 'object' || schema.additionalProperties !== false ||
        !Array.isArray(schema.required) ||
        !schema.properties || typeof schema.properties !== 'object' ||
        Array.isArray(schema.properties)) {
        throw new Error('Owner-addition schema must be a closed object.');
    }
    if (Object.keys(schema).some(key => !['$schema', 'type', 'additionalProperties', 'required', 'properties', 'description'].includes(key))) {
        throw new Error('Owner-addition schema uses an unsupported rule.');
    }
    const propertyKeys = Object.keys(schema.properties);
    if (new Set(schema.required).size !== schema.required.length ||
        propertyKeys.length !== schema.required.length ||
        propertyKeys.some(key => !schema.required.includes(key))) {
        throw new Error('Owner-addition schema must require every declared property.');
    }
    for (const key of REQUIRED_CHECKS) {
        if (!schema.required.includes(key) ||
            schema.properties[key]?.type !== 'boolean') {
            throw new Error(`Owner-addition schema must require boolean ${key}.`);
        }
    }
    if (!schema.required.includes('summary') ||
        schema.properties.summary?.type !== 'string') {
        throw new Error('Owner-addition schema must require a summary string.');
    }
    for (const [key, property] of Object.entries(schema.properties)) {
        if (!property || typeof property !== 'object' || Array.isArray(property) ||
            Object.keys(property).some(name => !['type', 'description'].includes(name)) ||
            (key !== 'summary' && property.type !== 'boolean')) {
            throw new Error(`Owner-addition schema has an unsupported property: ${key}.`);
        }
    }
}
export function validateOwnerAdditionEligibility(rawDecision, schema) {
    validateOwnerAdditionEligibilitySchema(schema);
    let decision;
    try {
        decision = JSON.parse(rawDecision);
    }
    catch {
        throw new Error('Owner-addition reviewer returned invalid JSON.');
    }
    if (!decision || typeof decision !== 'object' || Array.isArray(decision) ||
        typeof decision.summary !== 'string' || !decision.summary.trim() ||
        decision.summary.length > 4_000) {
        throw new Error('Owner-addition reviewer returned an incomplete decision.');
    }
    for (const key of REQUIRED_CHECKS) {
        if (decision[key] !== true)
            throw new Error(`Owner-addition reviewer did not establish ${key}.`);
    }
    const expected = Object.keys(schema.properties);
    if (Object.keys(decision).length !== expected.length || expected.some(key => !Object.hasOwn(decision, key))) {
        throw new Error('Owner-addition reviewer did not return the complete selected schema.');
    }
    for (const key of expected) {
        if (key !== 'summary' && decision[key] !== true) {
            throw new Error(`Owner-addition reviewer did not establish consumer check ${key}.`);
        }
    }
    // The schema and required-key loops above establish the static shape returned to typed callers.
    return decision;
}
export function validateOrdinaryOwnerDecisionSchema(schema) {
    if (!schema || typeof schema !== 'object' || Array.isArray(schema) ||
        !Array.isArray(schema.required) ||
        !schema.required.includes('ownerDecisionId') ||
        !schema.properties ||
        schema.properties.ownerDecisionId?.type !== 'string') {
        throw new Error('Protected ordinary review schema must require ownerDecisionId.');
    }
}
export function validateOrdinaryOwnerDecision(rawDecision, missingDecisionId) {
    let decision;
    try {
        decision = JSON.parse(rawDecision);
    }
    catch {
        throw new Error('Ordinary review did not return valid JSON.');
    }
    if (!decision || decision.decision !== 'OWNER_DECISION' ||
        !DECISION_ID.test(decision.ownerDecisionId) ||
        decision.ownerDecisionId !== missingDecisionId ||
        typeof decision.summary !== 'string' || !decision.summary.trim() ||
        (decision.gates && typeof decision.gates === 'object' &&
            Object.values(decision.gates).some(gate => gate?.decision === 'BLOCK'))) {
        throw new Error('Ordinary OWNER_DECISION does not identify the exact missing decision without a BLOCK.');
    }
    // The existing decision, ID-equality, and summary checks establish this shape when called with a string ID.
    return decision;
}
