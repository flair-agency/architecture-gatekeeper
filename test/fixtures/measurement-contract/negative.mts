import { beginMeasurement, sampleMeasurementPopulation } from '../../../src/measurement-api.mts';
import { readMeasurementJson, validateMeasurementRecord } from '../../../src/measurement.mts';
import { runCiMeasurement } from '../../../src/measurement-ci.mts';

beginMeasurement({ directory: 42 });
beginMeasurement().request({ repositoryRoot: 42 });
sampleMeasurementPopulation({}, { seed: 'frozen', count: '5' });
const parsed: { decision: 'PASS' } = readMeasurementJson('/private/record.json');
runCiMeasurement('start', { AGK_MEASUREMENT_DIR: 42 });
const uncheckedRequest: { promptSha256: string } = validateMeasurementRecord({}).request;
const uncheckedTimestamp: string = validateMeasurementRecord({}).startedAt;
void [parsed, uncheckedRequest, uncheckedTimestamp];
