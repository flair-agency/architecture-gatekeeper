// Extract only the two fixed files used by the OWNER_AMENDMENT handoff.
// This parser accepts a deliberately narrow ZIP profile; it does not validate
// record semantics, provenance, or adoption.
import { inflateRawSync } from 'node:zlib';

const MAX_ARCHIVE_BYTES = 2 * 1024 * 1024;
const MAX_FILE_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * MAX_FILE_BYTES;
const FILES = Object.freeze({
  block: Object.freeze(['review-record.json', 'attestation-bundle.json']),
  ownerDecision: Object.freeze(['review-record.json', 'attestation-bundle.json']),
  eligibility: Object.freeze(['eligibility-receipt.json', 'attestation-bundle.json']),
});
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const DESCRIPTOR = 0x08074b50;

const fail = message => { throw new Error(`Owner amendment artifact ZIP: ${message}`); };

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function findEndRecord(zip) {
  const min = Math.max(0, zip.length - 22 - 0xffff);
  for (let offset = zip.length - 22; offset >= min; offset--) {
    if (zip.readUInt32LE(offset) !== EOCD) continue;
    const commentLength = zip.readUInt16LE(offset + 20);
    if (offset + 22 + commentLength === zip.length) return offset;
  }
  fail('end-of-central-directory record is missing or malformed.');
}

function parseEntries(zip, files) {
  if (!Buffer.isBuffer(zip) || zip.length < 22 || zip.length > MAX_ARCHIVE_BYTES) {
    fail('archive is invalid or exceeds the compressed-size limit.');
  }
  const end = findEndRecord(zip);
  const disk = zip.readUInt16LE(end + 4);
  const centralDisk = zip.readUInt16LE(end + 6);
  const diskEntries = zip.readUInt16LE(end + 8);
  const entryCount = zip.readUInt16LE(end + 10);
  const centralSize = zip.readUInt32LE(end + 12);
  const centralOffset = zip.readUInt32LE(end + 16);
  if (disk !== 0 || centralDisk !== 0 || diskEntries !== entryCount || entryCount !== files.length ||
      centralOffset + centralSize !== end || centralOffset > zip.length || centralSize > zip.length) {
    fail('multi-disk, ZIP64, unexpected-entry-count, or malformed directory is unsupported.');
  }
  const entries = [];
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index++) {
    if (offset + 46 > end || zip.readUInt32LE(offset) !== CENTRAL) fail('central directory entry is malformed.');
    const flags = zip.readUInt16LE(offset + 8);
    const method = zip.readUInt16LE(offset + 10);
    const crc = zip.readUInt32LE(offset + 16);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const uncompressedSize = zip.readUInt32LE(offset + 24);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const diskStart = zip.readUInt16LE(offset + 34);
    const localOffset = zip.readUInt32LE(offset + 42);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    const permittedFlags = method === 8 ? 0x080e : 0x0808;
    if (next > end || nameLength === 0 || diskStart !== 0 || (flags & 1) !== 0 ||
        (flags & ~permittedFlags) !== 0 || ![0, 8].includes(method) ||
        compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff ||
        uncompressedSize > MAX_FILE_BYTES || compressedSize > MAX_ARCHIVE_BYTES) {
      fail('encrypted, unsupported, oversized, or malformed entry is present.');
    }
    const nameBytes = zip.subarray(offset + 46, offset + 46 + nameLength);
    const name = nameBytes.toString('utf8');
    if (!Buffer.from(name, 'utf8').equals(nameBytes) || !files.includes(name)) fail('archive contains an unexpected or unsafe path.');
    entries.push({ name, flags, method, crc, compressedSize, uncompressedSize, localOffset });
    offset = next;
  }
  if (offset !== end || entries.map(entry => entry.name).sort().join('\0') !== [...files].sort().join('\0')) {
    fail('archive contains duplicate, missing, or unindexed entries.');
  }
  if (entries.reduce((sum, entry) => sum + entry.uncompressedSize, 0) > MAX_TOTAL_BYTES) {
    fail('expanded archive exceeds the total-size limit.');
  }
  return { entries, centralOffset };
}

function extractEntry(zip, entry, centralOffset) {
  const offset = entry.localOffset;
  if (offset + 30 > centralOffset || zip.readUInt32LE(offset) !== LOCAL) fail('local file header is malformed.');
  const flags = zip.readUInt16LE(offset + 6);
  const method = zip.readUInt16LE(offset + 8);
  const localCrc = zip.readUInt32LE(offset + 14);
  const localCompressedSize = zip.readUInt32LE(offset + 18);
  const localUncompressedSize = zip.readUInt32LE(offset + 22);
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  const hasDescriptor = (entry.flags & 8) !== 0;
  if (flags !== entry.flags || method !== entry.method || dataEnd > centralOffset || dataStart < offset + 30 ||
      (!hasDescriptor && (localCrc !== entry.crc || localCompressedSize !== entry.compressedSize || localUncompressedSize !== entry.uncompressedSize)) ||
      (hasDescriptor && (localCrc !== 0 || localCompressedSize !== 0 || localUncompressedSize !== 0))) {
    fail('local and central entry metadata differ or data is truncated.');
  }
  const localName = zip.subarray(offset + 30, offset + 30 + nameLength);
  if (localName.toString('utf8') !== entry.name || !Buffer.from(entry.name, 'utf8').equals(localName)) {
    fail('local and central entry paths differ.');
  }
  const compressed = zip.subarray(dataStart, dataEnd);
  let rangeEnd = dataEnd;
  if (hasDescriptor) {
    let descriptor = dataEnd;
    if (descriptor + 4 <= zip.length && zip.readUInt32LE(descriptor) === DESCRIPTOR) descriptor += 4;
    if (descriptor + 12 > centralOffset || zip.readUInt32LE(descriptor) !== entry.crc ||
        zip.readUInt32LE(descriptor + 4) !== entry.compressedSize ||
        zip.readUInt32LE(descriptor + 8) !== entry.uncompressedSize) {
      fail('data descriptor differs from its directory record.');
    }
    rangeEnd = descriptor + 12;
  }
  let bytes;
  try {
    bytes = entry.method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: MAX_FILE_BYTES });
  } catch {
    fail('entry decompression failed or exceeded the per-file limit.');
  }
  if (bytes.length !== entry.uncompressedSize || crc32(bytes) !== entry.crc) fail('entry size or CRC does not match its directory record.');
  return { bytes, rangeStart: offset, rangeEnd };
}

/** Return exact profile-specific raw payload byte strings, with no semantic claims. */
export function extractOwnerAmendmentArtifactZip(zipInput, { profile = 'block' } = {}) {
  try {
    const files = FILES[profile];
    if (!files) fail('artifact profile is unsupported.');
    const zip = Buffer.isBuffer(zipInput) ? zipInput : zipInput instanceof Uint8Array
      ? Buffer.from(zipInput.buffer, zipInput.byteOffset, zipInput.byteLength) : null;
    const { entries, centralOffset } = parseEntries(zip, files);
    const extracted = Object.create(null);
    const ranges = [];
    for (const entry of entries) {
      const result = extractEntry(zip, entry, centralOffset);
      extracted[entry.name] = result.bytes;
      ranges.push([result.rangeStart, result.rangeEnd]);
    }
    ranges.sort((left, right) => left[0] - right[0]);
    let coveredUntil = 0;
    for (const [start, end] of ranges) {
      if (start !== coveredUntil) fail('local entry ranges overlap or leave unindexed bytes.');
      coveredUntil = end;
    }
    if (coveredUntil !== centralOffset) fail('unindexed bytes precede the central directory.');
    if (profile === 'eligibility') return Object.freeze({ status: 'EXTRACTED_OWNER_AMENDMENT_ELIGIBILITY_ARTIFACT',
      eligibilityReceiptBytes: Buffer.from(extracted['eligibility-receipt.json']),
      attestationBundleBytes: Buffer.from(extracted['attestation-bundle.json']) });
    return Object.freeze({ status: 'EXTRACTED_OWNER_AMENDMENT_BLOCK_ARTIFACT',
      reviewRecordBytes: Buffer.from(extracted['review-record.json']),
      attestationBundleBytes: Buffer.from(extracted['attestation-bundle.json']) });
  } catch (error) {
    return Object.freeze({ status: 'INCOMPLETE', reason: error.message });
  }
}

export function extractOwnerAmendmentBlockArtifactZip(zipInput) {
  return extractOwnerAmendmentArtifactZip(zipInput, { profile: 'block' });
}

export const OWNER_AMENDMENT_ARTIFACT_ZIP_LIMITS = Object.freeze({
  maxArchiveBytes: MAX_ARCHIVE_BYTES, maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: MAX_TOTAL_BYTES,
  requiredFiles: FILES.block,
  profiles: FILES,
});
