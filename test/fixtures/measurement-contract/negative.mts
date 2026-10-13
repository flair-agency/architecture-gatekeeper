import { beginMeasurement, sampleMeasurementPopulation } from '../../../src/measurement-api.mts';
import { readMeasurementJson, validateMeasurementRecord } from '../../../src/measurement.mts';
// CI-specific negative typing is added in the dependent CI slice.

beginMeasurement({ directory: 42 });
beginMeasurement().request({ repositoryRoot: 42 });
sampleMeasurementPopulation({}, { seed: 'frozen', count: '5' });
const parsed: { decision: 'PASS' } = readMeasurementJson('/private/record.json');
beginMeasurement({ changeId: 42 });
const uncheckedRequest: { promptSha256: string } = validateMeasurementRecord({}).request;
const uncheckedTimestamp: string = validateMeasurementRecord({}).startedAt;
void [parsed, uncheckedRequest, uncheckedTimestamp];
