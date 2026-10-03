import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const githubOutputModelName = 'flair-agency/github-output-model';
export function githubOutputModelArgs(source) {
  return [`--model-packs=${githubOutputModelName}`, `--additional-packs=${join(source, '.github/codeql/extensions/github-output')}`];
}

/** Exercise the actual accessor/model with the standard path-injection query. */
export function verifyGithubOutputModel({ run, source, scan }) {
  const fixture = join(scan, 'model-regression-source');
  mkdirSync(join(fixture, 'src'), { recursive: true });
  writeFileSync(join(fixture, 'src/github-runner-env.mjs'),
    readFileSync(join(source, 'src/github-runner-env.mjs'), 'utf8') +
    '\nexport function otherOutputPath() { return process.env.OTHER_OUTPUT; }\n');
  const program = `import { writeFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { trustedGitHubOutputPath, otherOutputPath } from './src/github-runner-env.mjs';
writeFileSync(trustedGitHubOutputPath(), 'trusted'); // trusted
writeFileSync(process.env.OTHER_OUTPUT, 'env'); // env
writeFileSync(process.argv[2], 'cli'); // cli
writeFileSync(otherOutputPath(), 'other accessor'); // other
writeFileSync(process.env.GITHUB_OUTPUT, 'direct env'); // direct
const p = process.env.CHECKED_OUTPUT;
if (isAbsolute(p)) {
  const before = lstatSync(p);
  if (before.isFile() && !before.isSymbolicLink() && before.nlink === 1) {
    writeFileSync(p, 'checked but untrusted'); // checked
  }
}
`;
  writeFileSync(join(fixture, 'probe.mjs'), program);
  const db = join(scan, 'db-model-regression');
  run(['database', 'create', db, '--language=javascript-typescript', `--source-root=${fixture}`, '--threads=2', '--ram=4096']);
  const results = {};
  for (const modeled of [false, true]) {
    const sarif = join(scan, `model-regression-${modeled ? 'modeled' : 'baseline'}.sarif`);
    run(['database', 'analyze', db, 'codeql/javascript-queries:Security/CWE-022/TaintedPath.ql',
      '--threat-model=local', '--rerun', ...(modeled ? githubOutputModelArgs(source) : []),
      '--format=sarif-latest', `--output=${sarif}`, '--threads=2', '--ram=4096']);
    results[modeled] = JSON.parse(readFileSync(sarif, 'utf8')).runs.flatMap(r => r.results || [])
      .flatMap(r => (r.locations || []).map(l => ({ rule: r.ruleId, file: l.physicalLocation.artifactLocation.uri, line: l.physicalLocation.region.startLine })))
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  }
  const taggedLine = tag => program.split('\n').findIndex(line => line.endsWith(`// ${tag}`)) + 1;
  for (const tag of ['trusted', 'env', 'cli', 'other', 'direct', 'checked']) {
    assert.ok(results.false.some(r => r.rule === 'js/path-injection' && r.file === 'probe.mjs' && r.line === taggedLine(tag)), `Baseline did not detect ${tag}`);
  }
  const expected = results.false.filter(r => !(r.file === 'probe.mjs' && r.line === taggedLine('trusted')));
  assert.deepEqual(results.true, expected, 'Model must remove only the trusted accessor flow, preserving every negative finding');
  writeFileSync(join(scan, 'model-regression.json'), JSON.stringify({ baseline: results.false, modeled: results.true, passed: true }, null, 2));
}
