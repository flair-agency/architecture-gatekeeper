import { execFileSync } from 'node:child_process';
import { classifyOwnerAmendmentTagAttempt } from '../src/owner-amendment-tag-attempt.mjs';
import { ownerAmendmentTagApiRoute } from '../src/runner-temp-path.mjs';

const fail = message => { throw new Error(`OWNER_AMENDMENT attempt classifier: ${message}`); };
const repository = process.env.GITHUB_REPOSITORY;
const baseSha = process.env.BASE_SHA;
const bSha = process.env.B_SHA;
const baseBranch = process.env.BASE_BRANCH;
const triggerProfile = process.env.TRIGGER_PROFILE;
const token = process.env.GH_TOKEN;

function readProtectedPolicyBytes() {
  return execFileSync('git', ['-C', process.env.GITHUB_WORKSPACE, '--no-replace-objects', 'show',
    `${baseSha}:.codex/gatekeeper/ci-policy.json`], { encoding: 'buffer', maxBuffer: 65_536,
    stdio: ['ignore', 'pipe', 'pipe'] });
}

function readTagRef({ expectedUrl, repository: selectedRepository, tagNamespace, bSha: selectedB }) {
  if (!token || repository !== selectedRepository || selectedRepository !== 'flair-agency/architecture-gatekeeper' ||
      !process.env.GITHUB_WORKSPACE) fail('protected self repository, workspace, or GitHub token is unavailable.');
  const route = ownerAmendmentTagApiRoute(selectedRepository, tagNamespace, selectedB);
  let response;
  try {
    response = execFileSync('gh', ['api', '--include', route], { encoding: 'utf8', maxBuffer: 65_536,
      timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_TOKEN: token } });
  } catch (error) {
    response = Buffer.isBuffer(error.stdout) ? error.stdout.toString('utf8') : String(error.stdout ?? '');
  }
  const match = /^HTTP\/\S+ (\d{3})(?:\s|$)/m.exec(response);
  if (!match) fail('exact protected tag API status is unavailable.');
  return { status: Number(match[1]), requestedUrl: expectedUrl };
}

try {
  const result = await classifyOwnerAmendmentTagAttempt({ repository, baseSha, bSha, baseBranch, triggerProfile,
    policyBytes: readProtectedPolicyBytes(), readTagRef });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
