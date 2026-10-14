import { main } from '../../../src/ci-report.mjs';
import { main as physicalMain } from '../../../src/ci-review/ci-report-entrypoint.mts';
import type { ReportFetch, ReportFetchReadOptions, ReportFetchWriteOptions, ReportFetchReadSuccess } from '../../../src/ci-review/ci-report.mts';
declare const observation: unknown;
declare const externalThenable: PromiseLike<ReportFetchReadSuccess>;
const sync: ReportFetch = (_url: string, _options: ReportFetchReadOptions | ReportFetchWriteOptions) => ({ ok: true as const, json: () => observation });
const asynchronous: ReportFetch = async (_url: string, _options: ReportFetchReadOptions | ReportFetchWriteOptions) => ({ ok: true as const, json: () => observation });
const thenable: ReportFetch = () => externalThenable;
const completions: Promise<void>[] = [main(), main(undefined), main(fetch), main(sync), main(asynchronous), main(thenable), physicalMain(sync)];
void completions;

