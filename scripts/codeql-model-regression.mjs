import assert from 'node:assert/strict';
import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

export const githubOutputModelName = 'flair-agency/github-output-model';
export const githubWorkspaceModelName = 'flair-agency/github-workspace-model';
export const nativeSessionModelName = 'flair-agency/native-session-model';
export function githubOutputModelArgs(source) {
  return [`--model-packs=${githubOutputModelName}`, `--additional-packs=${join(source, '.github/codeql/extensions/github-output')}`];
}
export function githubWorkspaceModelArgs(source) {
  return [`--model-packs=${githubWorkspaceModelName}`, `--additional-packs=${join(source, '.github/codeql/extensions/github-workspace')}`];
}
export function githubModelArgs(source) {
  return [`--model-packs=${githubOutputModelName}`, `--model-packs=${githubWorkspaceModelName}`, `--model-packs=${nativeSessionModelName}`,
    `--additional-packs=${[join(source, '.github/codeql/extensions/github-output'), join(source, '.github/codeql/extensions/github-workspace'), join(source, '.github/codeql/extensions/native-session')].join(delimiter)}`];
}

/** Run the local path-injection regression against production callers and the selected model packs. */
export function verifyGithubOutputModel({ run, source, scan }) {
  const fixture = join(scan, 'model-regression-source');
  cpSync(join(source, 'src'), join(fixture, 'src'), { recursive: true });
  const extraAccessor = `\nexport function otherOutputPath() { return process.env.OTHER_OUTPUT; }\n`;
  writeFileSync(join(fixture, 'src/github-runner-env.mjs'), readFileSync(join(fixture, 'src/github-runner-env.mjs'), 'utf8') + extraAccessor);
  const probe = `import { writeFileSync, lstatSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { trustedGitHubOutputPath, otherOutputPath } from './src/github-runner-env.mjs';
import { trustedGitHubOutputPath as implementationOutputPath } from './src/github/github-runner-env.mts';
writeFileSync(trustedGitHubOutputPath(), 'trusted'); // trusted-output
writeFileSync(implementationOutputPath(), 'unmodeled implementation'); // implementation-output
writeFileSync(process.env.OTHER_OUTPUT, 'env'); // env-output
writeFileSync(process.argv[2], 'cli'); // cli-output
writeFileSync(otherOutputPath(), 'other accessor'); // other-output
writeFileSync(process.env.GITHUB_OUTPUT, 'direct env'); // direct-output
const p = process.env.CHECKED_OUTPUT;
if (isAbsolute(p)) {
  const before = lstatSync(p);
  if (before.isFile() && !before.isSymbolicLink() && before.nlink === 1) {
    writeFileSync(p, 'checked but untrusted'); // checked-output
  }
}
`;
  writeFileSync(join(fixture, 'output-probe.mjs'), probe);
  const workspaceProbe = `import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { trustedGitHubWorkspaceRoot, otherWorkspaceRoot, callerSelectedRoot } from './src/github-runner-workspace.mjs';
import { trustedGitHubWorkspaceRoot as copiedAccessor } from './src/untrusted-workspace.mjs';
import { readRegularGitSnapshot } from './src/legacy-git-snapshot.mjs';
import { prepareLegacyAuthority } from './src/prepare-legacy-ci-authority.mjs';
execFileSync('git', ['status'], { cwd: trustedGitHubWorkspaceRoot() }); // trusted-workspace
readFileSync(trustedGitHubWorkspaceRoot()); // trusted-workspace-path
execFileSync('git', ['status'], { cwd: process.env.GITHUB_WORKSPACE }); // direct-workspace
readFileSync(process.env.GITHUB_WORKSPACE); // direct-workspace-path
execFileSync('git', ['status'], { cwd: process.env.OTHER_WORKSPACE }); // otherenv-workspace
readFileSync(process.env.OTHER_WORKSPACE); // otherenv-workspace-path
execFileSync('git', ['status'], { cwd: process.argv[2] }); // cli-workspace
readFileSync(process.argv[2]); // cli-workspace-path
execFileSync('git', ['status'], { cwd: otherWorkspaceRoot() }); // otherexport-workspace
readFileSync(otherWorkspaceRoot()); // otherexport-workspace-path
execFileSync('git', ['status'], { cwd: callerSelectedRoot(process.argv[2]) }); // caller-workspace
readFileSync(callerSelectedRoot(process.argv[2])); // caller-workspace-path
execFileSync('git', ['status'], { cwd: copiedAccessor() }); // copied-workspace
readFileSync(copiedAccessor()); // copied-workspace-path
readRegularGitSnapshot({ root: process.env.GITHUB_WORKSPACE, commit: 'a'.repeat(40), path: 'file.txt' }); // generic-env-reader
readRegularGitSnapshot({ root: process.argv[2], commit: 'a'.repeat(40), path: 'file.txt' }); // generic-cli-reader
prepareLegacyAuthority({ root: process.argv[2], baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedSha: 'c'.repeat(40), baseBranch: 'main', policyPath: 'policy.json', outputPromptPath: 'prompt', outputSchemaPath: 'schema', outputPath: 'complete', provenancePath: 'provenance' }); // generic-prepare-cli
`;
  writeFileSync(join(fixture, 'src/github-runner-workspace.mjs'), readFileSync(join(source, 'src/github-runner-workspace.mjs'), 'utf8') +
    `\nexport function otherWorkspaceRoot() { return process.env.OTHER_WORKSPACE; }\nexport function callerSelectedRoot(root) { return root; }\n`);
  writeFileSync(join(fixture, 'src/untrusted-workspace.mjs'), readFileSync(join(fixture, 'src/github-runner-workspace.mjs'), 'utf8'));
  writeFileSync(join(fixture, 'workspace-probe.mjs'), workspaceProbe);

  const nativeProbe = `import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {trustedNativeRequestPath,trustedNativeDecisionPath} from './src/native-session-paths.mjs';
import {trustedNativeRequestPath as copiedPath} from './src/untrusted-native-session-paths.mjs';
import {runNativeReviewCli} from './src/native-review.mjs';
writeFileSync(trustedNativeRequestPath(),'original'); // trusted-native-request
readFileSync(trustedNativeDecisionPath()); // trusted-native-decision
readFileSync(process.argv[3]); // direct-native-argv
readFileSync(process.env.NATIVE_REQUEST); // direct-native-env
readFileSync(copiedPath()); // copied-native-accessor
readFileSync(resolve(process.argv[4])); // generic-native-path
const candidate={requestPath:process.argv[5]};
readFileSync(candidate.requestPath); // candidate-native-path
const reviewer={decisionPath:process.argv[6]};
readFileSync(reviewer.decisionPath); // reviewer-native-path
runNativeReviewCli(['prepare',process.argv[7],'task']); // injected-native-prepare
runNativeReviewCli(['validate',process.argv[8],process.argv[9]]); // injected-native-validate
`;
  writeFileSync(join(fixture,'src/untrusted-native-session-paths.mjs'),readFileSync(join(source,'src/native-session-paths.mjs'),'utf8'));
  writeFileSync(join(fixture,'native-probe.mjs'),nativeProbe);

  const db = join(scan, 'db-model-regression');
  run(['database', 'create', db, '--language=javascript-typescript', `--source-root=${fixture}`, '--threads=2', '--ram=4096']);
  const results = {};
  for (const modeled of [false, true]) {
    const sarif = join(scan, `model-regression-${modeled ? 'modeled' : 'baseline'}.sarif`);
    const args = ['database', 'analyze', db, 'codeql/javascript-queries:Security/CWE-022/TaintedPath.ql', '--threat-model=local', '--rerun'];
    if (modeled) args.push(...githubModelArgs(source));
    args.push('--format=sarif-latest', `--output=${sarif}`, '--threads=2', '--ram=4096');
    run(args);
    results[modeled] = JSON.parse(readFileSync(sarif, 'utf8')).runs.flatMap(r => r.results || []);
  }
  const alerts = list => list.flatMap(result => (result.locations || []).map(location => ({
    rule: result.ruleId,
    file: location.physicalLocation.artifactLocation.uri,
    line: location.physicalLocation.region.startLine,
  })));
  const findLine = (program, tag) => program.split('\n').findIndex(line => line.endsWith(`// ${tag}`)) + 1;
  const threadHas = (threadFlow, file, line) => threadFlow.locations.some(location => {
    const physical = location.location.physicalLocation;
    return physical.artifactLocation.uri === file && physical.region.startLine === line;
  });
  const assertProbeFlow = (list, file, line, expected, tag) => {
    const matching = list.some(result => (result.codeFlows || []).some(codeFlow => codeFlow.threadFlows.some(threadFlow =>
      threadHas(threadFlow, file, line))));
    assert.equal(matching, expected, `${tag} flow ${expected ? 'was not detected' : 'was unexpectedly modeled'}`);
  };
  const outputLines = ['trusted-output', 'implementation-output', 'env-output', 'cli-output', 'other-output', 'direct-output', 'checked-output'];
  for (const tag of outputLines) {
    assertProbeFlow(results.false, 'output-probe.mjs', findLine(probe, tag), true, tag);
    assertProbeFlow(results.true, 'output-probe.mjs', findLine(probe, tag), tag !== 'trusted-output', tag);
  }
  const workspaceTags = ['trusted-workspace-path', 'direct-workspace-path', 'otherenv-workspace-path', 'cli-workspace-path',
    'otherexport-workspace-path', 'caller-workspace-path', 'copied-workspace-path', 'generic-env-reader', 'generic-cli-reader', 'generic-prepare-cli'];
  for (const tag of workspaceTags) {
    const expectedModeled = tag !== 'trusted-workspace-path';
    const line = findLine(workspaceProbe, tag);
    assertProbeFlow(results.false, 'workspace-probe.mjs', line, true, tag);
    assertProbeFlow(results.true, 'workspace-probe.mjs', line, expectedModeled, tag);
  }

  const modeledOutputAlerts = alerts(results.true).filter(alert => alert.file === 'output-probe.mjs');
  const baselineOutputAlerts = alerts(results.false).filter(alert => alert.file === 'output-probe.mjs');
  assert.deepEqual(modeledOutputAlerts, baselineOutputAlerts.filter(alert => alert.line !== findLine(probe, 'trusted-output')),
    'Output model must preserve each unrelated output finding');

  const threads = list => list.flatMap(result => (result.codeFlows || []).flatMap(codeFlow => codeFlow.threadFlows));
  const accessorLine = 3;
  const hasAccessor = (list, callFile, callLine, sinkFile, sinkLine) => threads(list).some(thread =>
    threadHas(thread, 'src/github-runner-workspace.mjs', accessorLine) && threadHas(thread, callFile, callLine) && threadHas(thread, sinkFile, sinkLine));
  assert.ok(hasAccessor(results.false, 'src/materialize-regular-git-snapshot.mjs', 27, 'src/authority-validation/legacy-git-snapshot.mts', 31),
    'Baseline must trace accessor through materializer into Git snapshot cwd');
  assert.ok(hasAccessor(results.false, 'src/prepare-legacy-ci-authority.mjs', 76, 'src/prepare-legacy-ci-authority.mjs', 34),
    'Baseline must trace accessor into preparer git diff cwd');
  assert.equal(hasAccessor(results.true, 'src/materialize-regular-git-snapshot.mjs', 27, 'src/authority-validation/legacy-git-snapshot.mts', 31), false,
    'Model must remove materializer accessor flow');
  assert.equal(hasAccessor(results.true, 'src/prepare-legacy-ci-authority.mjs', 76, 'src/prepare-legacy-ci-authority.mjs', 34), false,
    'Model must remove preparer accessor flow to git diff cwd');
  assert.ok(threads(results.true).some(thread => threadHas(thread, 'workspace-probe.mjs', findLine(workspaceProbe, 'generic-cli-reader')) &&
    threadHas(thread, 'src/authority-validation/legacy-git-snapshot.mts', 31)), 'Generic reader CLI root flow must remain');
  assert.ok(threads(results.true).some(thread => threadHas(thread, 'workspace-probe.mjs', findLine(workspaceProbe, 'generic-prepare-cli')) &&
    threadHas(thread, 'src/prepare-legacy-ci-authority.mjs', 34)), 'Generic preparer CLI root flow to git diff cwd must remain');
  assert.ok(threads(results.true).some(thread => threadHas(thread, 'workspace-probe.mjs', findLine(workspaceProbe, 'generic-prepare-cli')) &&
    threadHas(thread, 'src/prepare-legacy-ci-authority.mjs', 36) && threadHas(thread, 'src/authority-validation/legacy-git-snapshot.mts', 31)),
    'Generic preparer CLI root flow to snapshot reader must remain');

  assert.equal(threads(results.true).some(thread => threadHas(thread, 'src/github-runner-workspace.mjs', accessorLine)), false,
    'No modeled flow may retain the dedicated accessor origin');
  for (const sinkLine of [31, 34]) {
    const sinkResults = results.true.filter(result => result.locations.some(location =>
      location.physicalLocation.artifactLocation.uri === 'src/authority-validation/legacy-git-snapshot.mts' &&
      location.physicalLocation.region.startLine === sinkLine));
    for (const tag of ['generic-env-reader', 'generic-cli-reader', 'generic-prepare-cli']) {
      assert.ok(threads(sinkResults).some(thread => threadHas(thread, 'workspace-probe.mjs', findLine(workspaceProbe, tag))),
        `${tag} must remain at Git snapshot sink ${sinkLine}`);
    }
  }
  const diffSinkResults = results.true.filter(result => result.locations.some(location =>
    location.physicalLocation.artifactLocation.uri === 'src/prepare-legacy-ci-authority.mjs' &&
    location.physicalLocation.region.startLine === 14));
  assert.ok(threads(diffSinkResults).some(thread => threadHas(thread, 'workspace-probe.mjs', findLine(workspaceProbe, 'generic-prepare-cli'))),
    'Generic preparer CLI root must remain at the actual git diff cwd sink');
  const workspaceAlerts = list => alerts(list).filter(alert => alert.file === 'workspace-probe.mjs');
  const trustedLines = ['trusted-workspace', 'trusted-workspace-path'].map(tag => findLine(workspaceProbe, tag));
  assert.deepEqual(workspaceAlerts(results.true), workspaceAlerts(results.false).filter(alert => !trustedLines.includes(alert.line)),
    'Workspace model must preserve all unrelated workspace probe findings');

  const nativeTags=['trusted-native-request','trusted-native-decision','direct-native-argv','direct-native-env','copied-native-accessor','generic-native-path','candidate-native-path','reviewer-native-path','injected-native-prepare','injected-native-validate'];
  for(const tag of nativeTags) {
    const line=findLine(nativeProbe,tag);
    assertProbeFlow(results.false,'native-probe.mjs',line,true,tag);
    assertProbeFlow(results.true,'native-probe.mjs',line,!tag.startsWith('trusted-native-'),tag);
  }
  const nativeSource=readFileSync(join(source,'src/native-review.mjs'),'utf8');
  const nativeSink=tag=>findLine(nativeSource,tag);
  const nativeAccessorSource=readFileSync(join(source,'src/native-session-paths.mjs'),'utf8');
  const nativeOrigin=name=>findLine(nativeAccessorSource,name==='trustedNativeRequestPath'?'native-request-origin':'native-decision-origin');
  for(const [name,sinkTag] of [['trustedNativeRequestPath','native-request-persistence'],['trustedNativeRequestPath','native-request-read'],['trustedNativeDecisionPath','native-decision-read']]) {
    const origin=nativeOrigin(name),sink=nativeSink(sinkTag);assert.ok(origin>0&&sink>0);
    const flow=list=>threads(list).some(thread=>threadHas(thread,'src/native-session-paths.mjs',origin)&&threadHas(thread,'src/native-review.mjs',sink));
    assert.ok(flow(results.false),`Baseline must trace original native accessor into production ${sinkTag}`);
    assert.equal(flow(results.true),false,`Model must remove only original accessor flow at ${sinkTag}`);
  }
  for(const [probeTag,sinkTag] of [['injected-native-prepare','native-request-persistence'],['injected-native-validate','native-request-read'],['injected-native-validate','native-decision-read']]) {
    assert.ok(threads(results.true).some(thread=>threadHas(thread,'native-probe.mjs',findLine(nativeProbe,probeTag))&&threadHas(thread,'src/native-review.mjs',nativeSink(sinkTag))),`Injected array flow must remain at production ${sinkTag}`);
  }

  const report = {
    threatModel: 'local',
    baselineAlerts: alerts(results.false),
    modeledAlerts: alerts(results.true),
    modeledWorkspaceProbeFlows: workspaceTags.filter(tag => tag !== 'trusted-workspace-path'),
    trustedWorkspaceProbeFlowRemoved: true,
    nativeOriginalAccessorProductionFlowsRemoved: true,
    nativeInjectedProductionFlowsRetained: true,
    genericReaderAndPreparerFlowsRetained: true,
    note: 'SARIF alert counts aggregate flows at shared sinks; these counts do not represent production finding reduction or adoption.',
    passed: true,
  };
  writeFileSync(join(scan, 'model-regression.json'), JSON.stringify(report, null, 2));
}
