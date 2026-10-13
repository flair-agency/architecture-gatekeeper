#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadMeasurementDirectory, readMeasurementJson, redactMeasurement } from './measurement.mts';
import { aggregateMeasurement, sampleMeasurementPopulation } from './measurement-analysis.mts';

export function runMeasurementCli(argv = process.argv.slice(2)) {
  const [command, path, ...rest] = argv;
  if (command === 'export' && path && !rest.length) {
    const data = loadMeasurementDirectory(path);
    return { ...data, records: data.records.map(redactMeasurement) };
  }
  if (command === 'aggregate' && path && rest.length <= 2) return aggregateMeasurement(readMeasurementJson(path), { cohort: rest[0] || 'natural', domain: rest[1] || 'self' });
  if (command === 'sample' && path && rest.length >= 2 && rest.length <= 4) return sampleMeasurementPopulation(readMeasurementJson(path), { seed: rest[0], count: Number(rest[1]), cohort: rest[2] || 'natural', domain: rest[3] || 'self' });
  throw new Error('Usage: architecture-measurement export <private-directory> | aggregate <dataset.json> [natural|fixture] [self|consumer] | sample <dataset.json> <seed> <count> [cohort] [domain]');
}
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${JSON.stringify(runMeasurementCli(), null, 2)}\n`); }
  catch (error) { process.stderr.write(`${(error as { message: unknown }).message}\n`); process.exitCode = 2; }
}
