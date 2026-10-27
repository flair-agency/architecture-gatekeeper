import { decodeEvidenceZip } from '../../../src/github/owner-addition-evidence-zip.mts';

const externalArtifact: unknown = Buffer.alloc(0);
const decodedBytes: Buffer = decodeEvidenceZip(externalArtifact);
const exactByteView: Buffer = decodedBytes.subarray(0, decodedBytes.byteLength);
void exactByteView;
