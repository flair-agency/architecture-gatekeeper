import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { MAX_AUTHORITY_LIMITS, parseAuthorityManifest, rejectDuplicateJsonKeys } from '../src/authority-set.mjs';

const sourceRoot = new URL('..', import.meta.url);
const sourcePath = fileURLToPath(sourceRoot);
const helperUrl = new URL('../src/authority-set.mjs', import.meta.url).href;

function runChild(script, timeout = 5_000) {
  return spawnSync(process.execPath, ['--input-type=module', '-e', script], {
    cwd: sourcePath, encoding: 'utf8', timeout, maxBuffer: 1_000_000,
  });
}

test('the shared validator terminates on malformed JSON and representative production entrypoints', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { execFileSync } from 'node:child_process';
    import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
    import { tmpdir } from 'node:os';
    import { dirname, join } from 'node:path';
    import { createHash } from 'node:crypto';
    import { rejectDuplicateJsonKeys } from ${JSON.stringify(helperUrl)};
    import { parseCiPolicyJson } from './src/resolve-ci-policy.mjs';
    import { loadConfig } from './src/review-contract.mjs';
    import { decodeLimits } from './src/prepare-authority-set.mjs';
    import { validateMultiAuthorityEligibility } from './src/owner-addition-multiauthority.mjs';
    import { validateOwnerAmendmentOwnerDecisionAmendmentRecord } from './src/owner-amendment-owner-decision-amendment-record.mjs';
    import { validatePreparedCiDecision } from './src/prepared-ci-decision.mjs';

    const malformed = [
      '[', '[1', '[1,', '', '{', '{"a"', '{"a":', '{"a":[1',
      '{"a":1,}', '[,1]', '[1,,2]', '"unterminated',
      '{"a":1} trailing', '{"a" 1}', '{"a":1 "b":2}',
      '{"a":"\\\\q"}', '{"a":"\\\\u12"}', '{"a":"\\\\x41"}',
      '01', '-01', '+1', '.1', '1.', '1e', '1e+', '--1', 'True', 'undefined',
      '[1 2]', '{"a"::1}', '{"a":1\u00a0}',
    ];
    for (const value of malformed) {
      assert.throws(() => rejectDuplicateJsonKeys(value, 'generated input'));
      assert.throws(() => JSON.parse(value));
    }
    for (const prefix of ['[', '{"a":[', '{"a":"', '[{"b":']) {
      for (const suffix of ['', '}', ']', ',']) {
        const value = prefix + 'x' + suffix;
        try { JSON.parse(value); } catch {
          assert.throws(() => rejectDuplicateJsonKeys(value, 'generated corpus'));
        }
      }
    }
    const validDocuments = [
      '[]', '[1, {"a":"value"}]', '{"false":false,"nested":[null,3]}',
      '{"unicode":"naïve 💡","array":[0,true,null]}', '"literal Unicode ☃"',
      ' -0.25e+2 ', '\\t{"a" : [false, null, 42]}\\r\\n',
    ];
    for (const document of validDocuments) {
      assert.doesNotThrow(() => JSON.parse(document));
      assert.doesNotThrow(() => rejectDuplicateJsonKeys(document, 'valid generated input'));
      for (let length = 0; length < document.length; length++) {
        const truncated = document.slice(0, length);
        try { JSON.parse(truncated); } catch {
          assert.throws(() => rejectDuplicateJsonKeys(truncated, 'truncated generated input'));
        }
      }
    }
    const grammarSeeds = [
      'null', 'true', 'false', '-0', '1e309', '1.5e-12',
      '"escaped \\\"quote\\\""', '"\\ud800"',
      '[1,{"a":false,"b":[null,3]}]', '{"é":"💡","nested":{"x":0}}',
      ' \\t[ true , -2.5E+4 ]\\n',
    ];
    const alphabet = '[]{}":,ntfalsru0123456789.eE+-\\ abc\\t\\n☃';
    let randomState = 413;
    const random = limit => {
      randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
      return randomState % limit;
    };
    for (let index = 0; index < 5_000; index++) {
      const seed = grammarSeeds[random(grammarSeeds.length)];
      const offset = random(seed.length + 1);
      const operation = random(3);
      let candidate;
      if (operation === 0) {
        candidate = seed.slice(0, offset) + alphabet[random(alphabet.length)] + seed.slice(offset);
      } else if (operation === 1 && seed.length) {
        candidate = seed.slice(0, Math.min(offset, seed.length - 1)) + seed.slice(Math.min(offset, seed.length - 1) + 1);
      } else if (seed.length) {
        const replaceAt = Math.min(offset, seed.length - 1);
        candidate = seed.slice(0, replaceAt) + alphabet[random(alphabet.length)] + seed.slice(replaceAt + 1);
      } else {
        candidate = seed;
      }
      let nativeAccepts = true;
      try { JSON.parse(candidate); } catch { nativeAccepts = false; }
      let scannerError;
      try { rejectDuplicateJsonKeys(candidate, 'differential grammar mutation'); }
      catch (error) { scannerError = error; }
      if (scannerError?.message.includes('duplicate JSON key')) continue;
      assert.equal(!scannerError, nativeAccepts, \`JSON grammar disagreement for \${JSON.stringify(candidate)}\`);
    }

    assert.throws(() => parseCiPolicyJson('{"version":1,"branches":['));
    const limits = Buffer.from('{"maxManifestBytes":[').toString('base64');
    assert.throws(() => decodeLimits(limits));

    const temp = mkdtempSync(join(tmpdir(), 'gatekeeper-json-config-'));
    try {
      const configPath = join(temp, '.codex/gatekeeper/config.json');
      mkdirSync(dirname(configPath), { recursive: true });
      writeFileSync(configPath, '{"version":1,"branches":[');
      const git = (...args) => execFileSync('git', args, { cwd: temp, stdio: 'ignore' });
      git('init', '-q');
      git('config', 'user.name', 'JSON parser test');
      git('config', 'user.email', 'json-parser@example.invalid');
      git('add', '.'); git('commit', '-qm', 'malformed config fixture');
      const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: temp, encoding: 'utf8' }).trim();
      assert.throws(() => loadConfig(temp, revision), /configuration is invalid/);
    } finally { rmSync(temp, { recursive: true, force: true }); }

    const schema = JSON.parse((await import('node:fs')).readFileSync('./examples/owner-addition-v2/eligibility.schema.json', 'utf8'));
    const members = [{ id: 'architecture', repository: 'example/project', resolvedCommit: 'a'.repeat(40),
      path: 'docs/architecture.md', byteLength: 1, sha256: 'b'.repeat(64) }];
    const setDigest = createHash('sha256').update(JSON.stringify(members)).digest('hex');
    const provenance = { version: 2, selfRepository: 'example/project', authorityRevision: 'a'.repeat(40),
      manifestSha256: 'c'.repeat(64), setDigest, members };
    assert.throws(() => validateMultiAuthorityEligibility('{"version":2,"authorityIds":[', schema, provenance));
    assert.equal(validateOwnerAmendmentOwnerDecisionAmendmentRecord({ bytes: Buffer.from('{"a":[') }).status, 'INCOMPLETE');

    const prepared = { responseBytes: Buffer.from('{"decision":"PASS","authorityIds":[['),
      schemaBytes: Buffer.from('{}'), authorityProvenance: null, validationRules: null,
      maxResponseBytes: 65_536, maxSchemaBytes: 1_048_576 };
    assert.throws(() => validatePreparedCiDecision(prepared), /invalid JSON/);
  `;
  const result = runChild(script);
  assert.equal(result.error, undefined, `production entrypoint child failed: ${result.stderr}`);
  assert.equal(result.status, 0, `production entrypoint child failed: ${result.stderr}`);
});

test('valid JSON, Unicode-equivalent duplicate keys and configurable depth retain their behavior', () => {
  assert.doesNotThrow(() => rejectDuplicateJsonKeys('{"emoji":"💡","é":1}', 'UTF-8 fixture'));
  assert.throws(() => rejectDuplicateJsonKeys('{"é":1,"\\u00e9":2}', 'Unicode fixture'), /duplicate JSON key/);
  assert.doesNotThrow(() => rejectDuplicateJsonKeys('{"a":[]}', 'depth one', { maxDepth: 1 }));
  assert.throws(() => rejectDuplicateJsonKeys('{"a":[0]}', 'depth one', { maxDepth: 1 }), /nesting is too deep/);
  const atLimit = `${'['.repeat(514)}0${']'.repeat(514)}`;
  const overLimit = `${'['.repeat(515)}0${']'.repeat(515)}`;
  assert.doesNotThrow(() => rejectDuplicateJsonKeys(atLimit, 'maximum depth', { maxDepth: 514 }));
  assert.throws(() => rejectDuplicateJsonKeys(overLimit, 'maximum depth', { maxDepth: 514 }), /nesting is too deep/);
  assert.throws(() => rejectDuplicateJsonKeys('{}', 'maximum option', { maxDepth: 515 }), /depth must be within 1\.\.514/);
  assert.throws(() => rejectDuplicateJsonKeys(Buffer.from('{}'), 'non-string input'), /source must be a string/);
  assert.throws(() => rejectDuplicateJsonKeys('{}', 'invalid option', { maxDepth: 0 }), /depth must be within 1\.\.514/);
});

test('manifest byte boundary and malformed UTF-8 remain enforced', () => {
  const manifest = Buffer.from('{"version":1,"authorities":[{"id":"architecture","repository":"self","revision":"authority-revision","path":"docs/architecture.md"}]}');
  const exactLimit = { ...MAX_AUTHORITY_LIMITS, maxManifestBytes: manifest.length };
  assert.doesNotThrow(() => parseAuthorityManifest(manifest, exactLimit));
  assert.throws(() => parseAuthorityManifest(manifest, { ...exactLimit, maxManifestBytes: manifest.length - 1 }), /limit/);
  assert.throws(() => parseAuthorityManifest(Buffer.from([0xff]), MAX_AUTHORITY_LIMITS), /valid UTF-8 JSON/);
});

test('rejects extreme nesting before whole-document parsing in a low-heap child', () => {
  const script = `
    import assert from 'node:assert/strict';
    import { rejectDuplicateJsonKeys } from ${JSON.stringify(helperUrl)};
    const depth = 1_000_000;
    const source = '['.repeat(depth) + '0' + ']'.repeat(depth);
    assert.throws(() => rejectDuplicateJsonKeys(source, 'low-heap depth input'), /nesting is too deep/);
  `;
  const result = spawnSync(process.execPath, ['--max-old-space-size=32', '--input-type=module', '-e', script], {
    cwd: sourcePath, encoding: 'utf8', timeout: 5_000, maxBuffer: 1_000_000,
  });
  assert.equal(result.error, undefined, `low-heap scanner child failed or timed out: ${result.stderr}`);
  assert.equal(result.status, 0, `low-heap scanner child failed: ${result.stderr}`);
});
