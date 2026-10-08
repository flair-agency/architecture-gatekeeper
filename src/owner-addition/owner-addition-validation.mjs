// Shared OWNER_ADDITION validators used by both the CI adapter and multi-authority flow.
const REQUIRED_CHECKS = [
    'eligible', 'onlyMissingDecision', 'preservesExistingRules',
    'noContradiction', 'noUnsupportedCompletionClaim', 'noUnrelatedUnresolvedChoices',
    'matchesOrdinaryOwnerDecision',
];
const DECISION_ID = /^[a-z0-9][a-z0-9._-]{0,99}$/;
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function optionalProperty(value, key) {
    if (value === null || value === undefined)
        return undefined;
    return Reflect.get(Object(value), key);
}
export function validateOwnerAdditionEligibilitySchema(schema) {
    if (!isRecord(schema) || schema.type !== 'object' || schema.additionalProperties !== false ||
        !Array.isArray(schema.required) || !isRecord(schema.properties)) {
        throw new Error('Owner-addition schema must be a closed object.');
    }
    if (Object.keys(schema).some(key => !['$schema', 'type', 'additionalProperties', 'required', 'properties', 'description'].includes(key))) {
        throw new Error('Owner-addition schema uses an unsupported rule.');
    }
    const required = schema.required;
    const properties = schema.properties;
    const propertyKeys = Object.keys(properties);
    if (new Set(required).size !== required.length ||
        propertyKeys.length !== required.length ||
        propertyKeys.some(key => !required.includes(key))) {
        throw new Error('Owner-addition schema must require every declared property.');
    }
    for (const key of REQUIRED_CHECKS) {
        if (!required.includes(key) || optionalProperty(properties[key], 'type') !== 'boolean') {
            throw new Error(`Owner-addition schema must require boolean ${key}.`);
        }
    }
    if (!required.includes('summary') || optionalProperty(properties.summary, 'type') !== 'string') {
        throw new Error('Owner-addition schema must require a summary string.');
    }
    for (const [key, property] of Object.entries(properties)) {
        if (!property || typeof property !== 'object' || Array.isArray(property) ||
            Object.keys(property).some(name => !['type', 'description'].includes(name)) ||
            (key !== 'summary' && optionalProperty(property, 'type') !== 'boolean')) {
            throw new Error(`Owner-addition schema has an unsupported property: ${key}.`);
        }
    }
}
export function validateOwnerAdditionEligibility(rawDecision, schema) {
    validateOwnerAdditionEligibilitySchema(schema);
    let parsed;
    try {
        parsed = JSON.parse(rawDecision);
    }
    catch {
        throw new Error('Owner-addition reviewer returned invalid JSON.');
    }
    if (!isRecord(parsed) || typeof parsed.summary !== 'string' || !parsed.summary.trim() || parsed.summary.length > 4_000) {
        throw new Error('Owner-addition reviewer returned an incomplete decision.');
    }
    for (const key of REQUIRED_CHECKS) {
        if (parsed[key] !== true)
            throw new Error(`Owner-addition reviewer did not establish ${key}.`);
    }
    const expected = Object.keys(schema.properties);
    if (Object.keys(parsed).length !== expected.length || expected.some(key => !Object.hasOwn(parsed, key))) {
        throw new Error('Owner-addition reviewer did not return the complete selected schema.');
    }
    for (const key of expected) {
        if (key !== 'summary' && parsed[key] !== true) {
            throw new Error(`Owner-addition reviewer did not establish consumer check ${key}.`);
        }
    }
    // The schema and required-key loops above establish the static shape returned to typed callers.
    return parsed;
}
export function validateOrdinaryOwnerDecisionSchema(schema) {
    if (!isRecord(schema) || !Array.isArray(schema.required) || !schema.required.includes('ownerDecisionId') ||
        !schema.properties ||
        optionalProperty(optionalProperty(optionalProperty(schema, 'properties'), 'ownerDecisionId'), 'type') !== 'string') {
        throw new Error('Protected ordinary review schema must require ownerDecisionId.');
    }
}
export function validateOrdinaryOwnerDecision(rawDecision, missingDecisionId) {
    let parsed;
    try {
        parsed = JSON.parse(rawDecision);
    }
    catch {
        throw new Error('Ordinary review did not return valid JSON.');
    }
    if (!isRecord(parsed) || parsed.decision !== 'OWNER_DECISION' ||
        !DECISION_ID.test(String(parsed.ownerDecisionId)) ||
        parsed.ownerDecisionId !== missingDecisionId ||
        typeof parsed.summary !== 'string' || !parsed.summary.trim() ||
        (parsed.gates && typeof parsed.gates === 'object' &&
            Object.values(parsed.gates).some(gate => optionalProperty(gate, 'decision') === 'BLOCK'))) {
        throw new Error('Ordinary OWNER_DECISION does not identify the exact missing decision without a BLOCK.');
    }
    // The existing decision, ID-equality, and summary checks establish this shape when called with a string ID.
    return parsed;
}
