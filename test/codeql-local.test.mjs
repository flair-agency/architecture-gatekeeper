import test from 'node:test';
import assert from 'node:assert/strict';
import { delimiter } from 'node:path';
import { runCodeql } from '../scripts/codeql-local.mjs';
import { githubModelArgs, githubOutputModelArgs, githubWorkspaceModelArgs } from '../scripts/codeql-model-regression.mjs';

function harness({ missing = false, failure = 0, home = '/home/developer', redirected = false } = {}) {
  const calls = [], writes = new Map(), made = [], messages = [];
  const context = {
    verifyGithubOutputModel: () => {},
    fileURLToPath: () => '/repo/scripts/codeql-local.mjs',
    homedir: () => home,
    process: { platform: 'linux', exit(code) { throw new Error(`exit:${code}`); } },
    console: { log: text => messages.push(text), error: text => messages.push(text) },
    existsSync: root => root === '/' || root === '/home/developer',
    realpathSync: root => root === '/repo' ? root : redirected && root === '/home/developer' ? '/repo' : root,
    mkdirSync: root => made.push(root), mkdtempSync: prefix => `${prefix}unique`,
    writeFileSync: (file, text) => writes.set(file, text),
    readFileSync: () => JSON.stringify({ runs: [{ results: [{ ruleId: 'example' }, { ruleId: 'example' }] }] }),
    spawnSync(binary, args, options) {
      calls.push({ binary, args, options });
      return missing ? { error: { code: 'ENOENT' } } : { status: failure };
    },
  };
  return { calls, writes, made, messages, run: () => runCodeql(context) };
}
test('missing PATH CLI gives installation guidance before creating output', () => {
  const h = harness({ missing: true });
  assert.throws(h.run, /exit:1/);
  assert.match(h.messages.join('\n'), /Install the official CodeQL bundle/);
  assert.match(h.messages.join('\n'), /PATH/);
  assert.equal(h.made.length, 0);
  assert.equal(h.calls[0].binary, 'codeql');
});
test('CLI failures stop before output creation', () => {
  const h = harness({ failure: 7 });
  assert.throws(h.run, /CodeQL failed \(7\)/);
  assert.equal(h.calls.length, 1);
  assert.equal(h.made.length, 0);
});
test('fixed home output inside the checkout is rejected before creation', () => {
  const h = harness({ home: '/repo' });
  assert.throws(h.run, /outside the repository/);
  assert.equal(h.made.length, 0);
});
test('symlinked existing ancestor into checkout is rejected before creation', () => {
  const h = harness({ redirected: true });
  assert.throws(h.run, /outside the repository/);
  assert.equal(h.made.length, 0);
});
test('both languages retain SARIF summaries and report findings without a clean claim', () => {
  const h = harness(); h.run();
  assert.equal(h.calls.length, 5);
  assert.equal(h.calls[1].args.includes('--language=javascript-typescript'), true);
  assert.equal(h.calls[3].args.includes('--language=actions'), true);
  for (const call of h.calls) assert.equal(call.options.shell, undefined);
  const summary = JSON.parse([...h.writes.values()].at(-1));
  assert.equal(summary.languages.length, 2);
  assert.equal(summary.languages[0].findings, 2);
  assert.equal(summary.languages[1].rules.example, 2);
  assert.ok(summary.completedAt);
  assert.match(summary.scan, /^\/home\/developer\//);
  assert.match(h.messages.at(-1), /does not mean zero findings/);
});

test('both repository models are loaded by local JavaScript analysis with platform pack path separators', () => {
  assert.deepEqual(githubOutputModelArgs('/repo'), [
    '--model-packs=flair-agency/github-output-model',
    '--additional-packs=/repo/.github/codeql/extensions/github-output',
  ]);
  assert.deepEqual(githubWorkspaceModelArgs('/repo'), [
    '--model-packs=flair-agency/github-workspace-model',
    '--additional-packs=/repo/.github/codeql/extensions/github-workspace',
  ]);
  assert.deepEqual(githubModelArgs('/repo'), [
    '--model-packs=flair-agency/github-output-model',
    '--model-packs=flair-agency/github-workspace-model',
    `--additional-packs=${['/repo/.github/codeql/extensions/github-output', '/repo/.github/codeql/extensions/github-workspace'].join(delimiter)}`,
  ]);
  const h = harness(); h.run();
  const javascript = h.calls.find(call => call.args[0] === 'database' && call.args[1] === 'analyze' && call.args[2].endsWith('/db-javascript'));
  assert.ok(javascript.args.includes('--model-packs=flair-agency/github-output-model'));
  assert.ok(javascript.args.includes('--model-packs=flair-agency/github-workspace-model'));
  assert.ok(javascript.args.includes(`--additional-packs=${['/repo/.github/codeql/extensions/github-output', '/repo/.github/codeql/extensions/github-workspace'].join(delimiter)}`));
  const actions = h.calls.find(call => call.args[0] === 'database' && call.args[1] === 'analyze' && call.args[2].endsWith('/db-actions'));
  assert.equal(actions.args.some(argument => argument.startsWith('--model-packs=')), false);
});
