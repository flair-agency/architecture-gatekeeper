#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const source = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), '..'));
const binary = process.env.CODEQL_BIN || (process.platform === 'win32' ? 'codeql.exe' : 'codeql');
const scanRoot = process.env.SCAN_ROOT || join(homedir(), '.local/share/architecture-gatekeeper/codeql');
if ((process.env.CODEQL_BIN && !isAbsolute(binary)) || !isAbsolute(scanRoot)) throw new Error('CODEQL_BIN, when supplied, and SCAN_ROOT must be absolute paths.');
function run(args) {
  const result = spawnSync(binary, args, { stdio: 'inherit' });
  if (result.error?.code === 'ENOENT') {
    console.error(`CodeQL CLI was not found: ${binary}
Install the official CodeQL bundle for your OS:
https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/scan-from-the-command-line/set-up-codeql-cli
Add its codeql directory to PATH, or set CODEQL_BIN to the absolute path of codeql (Windows: codeql.exe).
Then run npm run codeql again.`);
    process.exit(1);
  }
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`CodeQL failed (${result.status ?? result.signal}); see scan logs.`);
}
run(['version']);
function requireOutsideRepository(root) {
  const rel = relative(source, root);
  if (rel === '' || (!rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel))) throw new Error('SCAN_ROOT must be outside the repository.');
}
// Resolve existing ancestors before creating anything, including symlinked parents.
let ancestor = resolve(scanRoot);
while (!existsSync(ancestor)) ancestor = dirname(ancestor);
const plannedRoot = resolve(realpathSync(ancestor), relative(ancestor, resolve(scanRoot)));
requireOutsideRepository(plannedRoot);
mkdirSync(plannedRoot, { recursive: true });
const physicalRoot = realpathSync(plannedRoot);
requireOutsideRepository(physicalRoot);
const scan = mkdtempSync(join(physicalRoot, 'scan-'));
console.log(`CodeQL output: ${scan}`);
const summary = { source, binary, scan, startedAt: new Date().toISOString(), languages: [] };
writeFileSync(join(scan, 'summary.json'), JSON.stringify(summary, null, 2));
for (const [language, suite] of [['javascript-typescript', 'javascript'], ['actions', 'actions']]) {
  const db = join(scan, `db-${suite}`);
  run(['database', 'create', db, `--language=${language}`, `--source-root=${source}`, '--threads=2', '--ram=4096']);
  const sarif = join(scan, `${suite}.sarif`);
  run(['database', 'analyze', db, `codeql/${suite}-queries:codeql-suites/${suite}-code-scanning.qls`, '--threat-model=local', '--format=sarif-latest', `--output=${sarif}`, '--threads=2', '--ram=4096']);
  const results = JSON.parse(readFileSync(sarif, 'utf8')).runs.flatMap(run => run.results || []);
  const counts = {};
  for (const finding of results) counts[finding.ruleId] = (counts[finding.ruleId] || 0) + 1;
  summary.languages.push({ language, sarif, findings: results.length, rules: counts });
  writeFileSync(join(scan, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`${language}: ${results.length} findings`);
}
summary.completedAt = new Date().toISOString();
writeFileSync(join(scan, 'summary.json'), JSON.stringify(summary, null, 2));
console.log('Analysis completed. Review SARIF findings before committing; successful execution does not mean zero findings.');
