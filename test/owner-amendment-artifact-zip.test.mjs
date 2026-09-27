import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractOwnerAmendmentBlockArtifactZip, OWNER_AMENDMENT_ARTIFACT_ZIP_LIMITS } from '../src/owner-amendment-artifact-zip.mjs';

const crc32 = bytes => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

function makeZip(entries, { comment = Buffer.alloc(0) } = {}) {
  const locals = [];
  const centrals = [];
  let localOffset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const content = Buffer.from(entry.content);
    const method = entry.method ?? 8;
    const flags = 0x800 | (entry.descriptor ? 8 : 0);
    const compressed = method === 0 ? content : deflateRawSync(content);
    const crc = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(entry.descriptor ? 0 : crc, 14);
    local.writeUInt32LE(entry.descriptor ? 0 : compressed.length, 18);
    local.writeUInt32LE(entry.descriptor ? 0 : content.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localExtra = Buffer.alloc(0);
    local.writeUInt16LE(localExtra.length, 28);
    const descriptor = entry.descriptor ? (() => {
      const value = Buffer.alloc(16);
      value.writeUInt32LE(0x08074b50, 0);
      value.writeUInt32LE(crc, 4);
      value.writeUInt32LE(compressed.length, 8);
      value.writeUInt32LE(content.length, 12);
      return value;
    })() : Buffer.alloc(0);
    locals.push(local, name, localExtra, compressed, descriptor);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x031e, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(localOffset, 42);
    centrals.push(central, name);
    localOffset += local.length + name.length + localExtra.length + compressed.length + descriptor.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBytes.length, 12);
  end.writeUInt32LE(localOffset, 16);
  end.writeUInt16LE(comment.length, 20);
  return Buffer.concat([...locals, centralBytes, end, comment]);
}

const normalEntries = () => [
  { name: 'review-record.json', content: Buffer.from('{"decision":"BLOCK"}') },
  { name: 'attestation-bundle.json', content: Buffer.from('{"attestations":[]}') },
];

test('extracts exact raw bytes for the two required root entries', () => {
  const entries = normalEntries();
  const result = extractOwnerAmendmentBlockArtifactZip(makeZip(entries));
  assert.equal(result.status, 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
  assert.deepEqual(result.reviewRecordBytes, entries[0].content);
  assert.deepEqual(result.attestationBundleBytes, entries[1].content);
  assert.deepEqual(OWNER_AMENDMENT_ARTIFACT_ZIP_LIMITS.requiredFiles, ['review-record.json', 'attestation-bundle.json']);
});

test('accepts UTF-8 entries with a ZIP data descriptor and EOCD comment', () => {
  const entries = normalEntries().map(entry => ({ ...entry, descriptor: true }));
  const result = extractOwnerAmendmentBlockArtifactZip(makeZip(entries, { comment: Buffer.from('comment') }));
  assert.equal(result.status, 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT');
});

test('rejects unexpected paths, extra entries, and duplicate names', async t => {
  const entries = normalEntries();
  const cases = [
    ['path traversal', [{ ...entries[0], name: '../review-record.json' }, entries[1]]],
    ['extra entry', [...entries, { name: 'extra.txt', content: Buffer.from('x') }]],
    ['duplicate name', [entries[0], { ...entries[0] }]],
    ['missing entry', [entries[0]]],
  ];
  for (const [name, zipEntries] of cases) await t.test(name, () => {
    assert.equal(extractOwnerAmendmentBlockArtifactZip(makeZip(zipEntries)).status, 'INCOMPLETE');
  });
});

test('rejects encrypted or unsupported compression entries', () => {
  const encrypted = makeZip(normalEntries());
  encrypted.writeUInt16LE(0x801, 6);
  assert.equal(extractOwnerAmendmentBlockArtifactZip(encrypted).status, 'INCOMPLETE');
  const unsupported = makeZip(normalEntries().map(entry => ({ ...entry, method: 12 })));
  assert.equal(extractOwnerAmendmentBlockArtifactZip(unsupported).status, 'INCOMPLETE');
});

test('rejects archive and expanded-size limits before returning payload bytes', () => {
  const oversizedEntry = { name: 'review-record.json', content: Buffer.alloc(OWNER_AMENDMENT_ARTIFACT_ZIP_LIMITS.maxFileBytes + 1) };
  const zip = makeZip([oversizedEntry, normalEntries()[1]]);
  assert.equal(extractOwnerAmendmentBlockArtifactZip(zip).status, 'INCOMPLETE');
  assert.equal(extractOwnerAmendmentBlockArtifactZip(Buffer.alloc(OWNER_AMENDMENT_ARTIFACT_ZIP_LIMITS.maxArchiveBytes + 1)).status, 'INCOMPLETE');
});

test('caps actual decompression even when ZIP headers understate the expanded size', () => {
  const zip = makeZip([{ name: 'review-record.json', content: Buffer.alloc(OWNER_AMENDMENT_ARTIFACT_ZIP_LIMITS.maxFileBytes + 10) }, normalEntries()[1]]);
  const centralStart = zip.readUInt32LE(zip.length - 22 + 16);
  const firstNameLength = zip.readUInt16LE(centralStart + 28);
  const secondCentral = centralStart + 46 + firstNameLength;
  zip.writeUInt32LE(1, 22);
  zip.writeUInt32LE(1, secondCentral + 24);
  assert.equal(extractOwnerAmendmentBlockArtifactZip(zip).status, 'INCOMPLETE');
});

test('rejects corrupted CRC, mismatched local path, and truncated archives', () => {
  const valid = makeZip(normalEntries());
  const centralStart = valid.readUInt32LE(valid.length - 22 + 16);
  const badCrc = Buffer.from(valid);
  badCrc.writeUInt32LE((badCrc.readUInt32LE(centralStart + 16) + 1) >>> 0, centralStart + 16);
  assert.equal(extractOwnerAmendmentBlockArtifactZip(badCrc).status, 'INCOMPLETE');

  const badLocalName = Buffer.from(valid);
  badLocalName[30] = 0x78;
  assert.equal(extractOwnerAmendmentBlockArtifactZip(badLocalName).status, 'INCOMPLETE');
  assert.equal(extractOwnerAmendmentBlockArtifactZip(valid.subarray(0, valid.length - 3)).status, 'INCOMPLETE');
});
