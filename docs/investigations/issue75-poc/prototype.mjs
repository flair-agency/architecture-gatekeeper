// Experimental protocol model only. Never imported by a production entrypoint.
import { createHash, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const POLICY_PATH = '.poc-policy.json';
export const INTENT_PATH = 'amendment.json';
export const MECHANISM = 'issue75-experiment/1';

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export const digest = value => createHash('sha256').update(canonical(value)).digest('hex');

// Fixture repositories use no hooks, external diff, global configuration or credentials.
export function git(repo, args, { raw = false } = {}) {
  const output = execFileSync('git', ['-c', 'core.hooksPath=/dev/null', ...args], {
    cwd: repo,
    env: {
      PATH: process.env.PATH,
      HOME: repo,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_TERMINAL_PROMPT: '0',
    },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 10_000,
    maxBuffer: 1024 * 1024,
  });
  return raw ? output : output.trimEnd();
}

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function fields(object, names, label) {
  requireThat(object && typeof object === 'object' && !Array.isArray(object), `${label}: object required`);
  requireThat(canonical(Object.keys(object).sort()) === canonical([...names].sort()), `${label}: unexpected or missing fields`);
}

function regularFile(repo, oid, path) {
  // Every path is either a fixed experiment path or selected by protected policy.
  const entry = git(repo, ['ls-tree', oid, '--', path]);
  requireThat(entry.startsWith('100644 blob ') && entry.endsWith(`\t${path}`), `regular file required: ${path}`);
  return git(repo, ['show', `${oid}:${path}`], { raw: true });
}

export function inputDigest(repo, base, policy) {
  return digest({
    mechanism: MECHANISM,
    policy: regularFile(repo, base, POLICY_PATH),
    inputs: policy.reviewInputs.map(path => ({ path, content: regularFile(repo, base, path) })),
  });
}

/**
 * context is supplied by the protected caller, never by candidate content.
 * review is an external, authenticated fixture-service envelope.
 * tagOid identifies an immutable owner-signed tag object, not a mutable tag name.
 * This function returns a simulated result; it cannot set GitHub checks or merge.
 */
export function simulateAcceptance({ repo, context, review, tagOid }) {
  try {
    fields(context, ['repository', 'changeId', 'base', 'head', 'challenge'], 'context');
    for (const key of ['base', 'head']) {
      requireThat(/^[a-f0-9]{40}$/.test(context[key]), `${key}: full SHA-1 required by fixture`);
      requireThat(git(repo, ['cat-file', '-t', context[key]]) === 'commit', `${key}: commit required`);
    }
    requireThat(/^[a-f0-9]{40}$/.test(tagOid), 'immutable tag OID required');
    const policy = JSON.parse(regularFile(repo, context.base, POLICY_PATH));
    requireThat(policy.schema === 'issue75-poc-policy/v1' && policy.enabled === true, 'protected policy has not enabled experiment');
    requireThat(policy.repository === context.repository, 'repository identity mismatch');
    requireThat(git(repo, ['merge-base', '--is-ancestor', context.base, context.head]) === '', 'head must descend from base');

    const intent = JSON.parse(regularFile(repo, context.head, INTENT_PATH));
    fields(intent, ['schema', 'reason', 'paths'], 'intent');
    requireThat(intent.schema === 'issue75-poc-intent/v1' && typeof intent.reason === 'string' && intent.reason.trim(), 'invalid intent');
    requireThat(Array.isArray(intent.paths) && intent.paths.length > 0 && intent.paths.every(path => policy.allowedPaths.includes(path)), 'intent outside protected scope');
    requireThat(new Set(intent.paths).size === intent.paths.length, 'duplicate intent path');
    const changed = git(repo, ['diff', '--no-ext-diff', '--no-renames', '--name-only', '-z', context.base, context.head]).split('\0').filter(Boolean).sort();
    requireThat(canonical(changed) === canonical([INTENT_PATH, ...intent.paths].sort()), 'change contains undeclared paths or executable/policy changes');
    for (const path of intent.paths) regularFile(repo, context.head, path);

    fields(review, ['payload', 'signature'], 'review envelope');
    const record = review.payload;
    fields(record, ['schema', 'repository', 'changeId', 'base', 'head', 'challenge', 'mechanism', 'inputDigest', 'complete', 'semantic'], 'review');
    requireThat(verify(null, Buffer.from(canonical(record)), policy.reviewerKey, Buffer.from(review.signature, 'base64')), 'review signature invalid');
    requireThat(record.schema === 'issue75-poc-review/v1' && record.mechanism === MECHANISM, 'review mechanism mismatch');
    for (const key of Object.keys(context)) requireThat(record[key] === context[key], `review ${key} mismatch`);
    requireThat(record.inputDigest === inputDigest(repo, context.base, policy), 'review input identity mismatch');
    requireThat(record.complete === true && record.semantic === 'BLOCK', 'requires completed BLOCK review');

    requireThat(git(repo, ['cat-file', '-t', tagOid]) === 'tag', 'annotated tag required');
    const temp = mkdtempSync(join(tmpdir(), 'issue75-verify-'));
    try {
      // The signer allowlist comes exclusively from the old protected base.
      requireThat(/^ssh-ed25519 [A-Za-z0-9+/=]+$/.test(policy.ownerKey), 'invalid protected owner key');
      const allowed = join(temp, 'allowed-signers');
      writeFileSync(allowed, `owner namespaces="git" ${policy.ownerKey}\n`);
      git(repo, ['-c', 'gpg.format=ssh', '-c', `gpg.ssh.allowedSignersFile=${allowed}`, 'verify-tag', tagOid]);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
    const tag = git(repo, ['cat-file', 'tag', tagOid]);
    const [headers, ...bodyParts] = tag.split('\n\n');
    requireThat(headers.split('\n').includes(`object ${context.head}`) && headers.split('\n').includes('type commit'), 'tag target mismatch');
    const body = bodyParts.join('\n\n').split('\n-----BEGIN SSH SIGNATURE-----')[0];
    const attestation = JSON.parse(body);
    fields(attestation, ['schema', 'repository', 'changeId', 'base', 'head', 'challenge', 'reviewDigest', 'intentDigest'], 'attestation');
    requireThat(attestation.schema === 'issue75-poc-attestation/v1', 'attestation schema mismatch');
    for (const key of Object.keys(context)) requireThat(attestation[key] === context[key], `attestation ${key} mismatch`);
    requireThat(attestation.reviewDigest === digest(review), 'attestation review digest mismatch');
    requireThat(attestation.intentDigest === digest(intent), 'attestation intent digest mismatch');

    return { experimental: true, acceptance: 'OWNER_AMENDMENT', semantic: record.semantic };
  } catch (error) {
    return { experimental: true, acceptance: 'REJECT', reason: error.message };
  }
}
