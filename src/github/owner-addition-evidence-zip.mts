import { inflateRawSync } from 'node:zlib';

const ARTIFACT_MAX_BYTES = 1_048_576;
const ZIP_ENTRY_MAX_BYTES = 524_288;
const ARTIFACT_FILE = 'eligibility-evidence.json';

function fail(message: string): never { throw new Error(`GitHub OWNER_ADDITION provenance: ${message}`); }

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// Decode only a classic, one-entry ZIP. ZIP64, encryption, multiple entries,
// path indirection and oversized expansion are deliberately unsupported.
export function decodeEvidenceZip(zipBytes: unknown): Buffer {
  if (!Buffer.isBuffer(zipBytes) || zipBytes.length < 22 || zipBytes.length > ARTIFACT_MAX_BYTES) fail('downloaded artifact ZIP size is invalid.');
  let eocd = -1;
  const searchFrom = Math.max(0, zipBytes.length - 65_557);
  for (let offset = zipBytes.length - 22; offset >= searchFrom; offset--) {
    if (zipBytes.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  if (eocd < 0 || eocd + 22 > zipBytes.length) fail('artifact ZIP end directory is missing.');
  const disk = zipBytes.readUInt16LE(eocd + 4);
  const cdDisk = zipBytes.readUInt16LE(eocd + 6);
  const entriesDisk = zipBytes.readUInt16LE(eocd + 8);
  const entries = zipBytes.readUInt16LE(eocd + 10);
  const cdSize = zipBytes.readUInt32LE(eocd + 12);
  const cdOffset = zipBytes.readUInt32LE(eocd + 16);
  const commentLength = zipBytes.readUInt16LE(eocd + 20);
  if (disk || cdDisk || entriesDisk !== 1 || entries !== 1 || cdSize === 0xffffffff || cdOffset === 0xffffffff ||
      eocd + 22 + commentLength !== zipBytes.length || cdOffset + cdSize !== eocd) fail('artifact ZIP must be a bounded, single-entry classic ZIP.');
  if (cdOffset + 46 > eocd || zipBytes.readUInt32LE(cdOffset) !== 0x02014b50) fail('artifact ZIP central directory is malformed.');
  const flags = zipBytes.readUInt16LE(cdOffset + 8);
  const method = zipBytes.readUInt16LE(cdOffset + 10);
  const expectedCrc = zipBytes.readUInt32LE(cdOffset + 16);
  const compressedSize = zipBytes.readUInt32LE(cdOffset + 20);
  const uncompressedSize = zipBytes.readUInt32LE(cdOffset + 24);
  const nameLength = zipBytes.readUInt16LE(cdOffset + 28);
  const extraLength = zipBytes.readUInt16LE(cdOffset + 30);
  const entryCommentLength = zipBytes.readUInt16LE(cdOffset + 32);
  const localOffset = zipBytes.readUInt32LE(cdOffset + 42);
  if (flags & 1 || (flags & ~0x808) !== 0 || ![0, 8].includes(method) || compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff || uncompressedSize < 1 || uncompressedSize > ZIP_ENTRY_MAX_BYTES ||
      cdOffset + 46 + nameLength + extraLength + entryCommentLength !== eocd || localOffset + 30 > cdOffset) {
    fail('artifact ZIP entry uses unsupported flags, compression, or size.');
  }
  const nameBytes = zipBytes.subarray(cdOffset + 46, cdOffset + 46 + nameLength);
  const name = nameBytes.toString('utf8');
  if (name !== ARTIFACT_FILE || Buffer.from(name, 'utf8').compare(nameBytes) !== 0) fail('artifact ZIP must contain only the exact eligibility evidence file.');
  if (zipBytes.readUInt32LE(localOffset) !== 0x04034b50) fail('artifact ZIP local header is malformed.');
  const localFlags = zipBytes.readUInt16LE(localOffset + 6);
  const localMethod = zipBytes.readUInt16LE(localOffset + 8);
  const localNameLength = zipBytes.readUInt16LE(localOffset + 26);
  const localExtraLength = zipBytes.readUInt16LE(localOffset + 28);
  const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
  if (localFlags !== flags || localMethod !== method || dataOffset + compressedSize > cdOffset ||
      zipBytes.subarray(localOffset + 30, localOffset + 30 + localNameLength).compare(nameBytes) !== 0) {
    fail('artifact ZIP local entry does not match its central directory.');
  }
  const localCrc = zipBytes.readUInt32LE(localOffset + 14);
  const localCompressedSize = zipBytes.readUInt32LE(localOffset + 18);
  const localUncompressedSize = zipBytes.readUInt32LE(localOffset + 22);
  if (flags & 0x8) {
    if ((localCrc !== 0 && localCrc !== expectedCrc) || (localCompressedSize !== 0 && localCompressedSize !== compressedSize) ||
        (localUncompressedSize !== 0 && localUncompressedSize !== uncompressedSize)) fail('artifact ZIP local placeholder sizes conflict with its central directory.');
    const descriptorOffset = dataOffset + compressedSize;
    const descriptorLength = cdOffset - descriptorOffset;
    const hasSignature = descriptorLength === 16 && zipBytes.readUInt32LE(descriptorOffset) === 0x08074b50;
    if (descriptorLength !== 12 && !hasSignature) fail('artifact ZIP data descriptor has an unsupported layout.');
    const valueOffset = descriptorOffset + (hasSignature ? 4 : 0);
    if (zipBytes.readUInt32LE(valueOffset) !== expectedCrc || zipBytes.readUInt32LE(valueOffset + 4) !== compressedSize ||
        zipBytes.readUInt32LE(valueOffset + 8) !== uncompressedSize) fail('artifact ZIP data descriptor differs from the central directory.');
  } else if (dataOffset + compressedSize !== cdOffset || localCrc !== expectedCrc ||
      localCompressedSize !== compressedSize || localUncompressedSize !== uncompressedSize) {
    fail('artifact ZIP local sizes differ from its central directory.');
  }
  const compressed = zipBytes.subarray(dataOffset, dataOffset + compressedSize);
  let output: Buffer;
  try { output = method === 0 ? Buffer.from(compressed) : inflateRawSync(compressed, { maxOutputLength: ZIP_ENTRY_MAX_BYTES }); }
  catch { fail('artifact ZIP entry cannot be safely decompressed.'); }
  if (output.length !== uncompressedSize || crc32(output) !== expectedCrc) fail('artifact ZIP entry size or CRC is invalid.');
  return output;
}
