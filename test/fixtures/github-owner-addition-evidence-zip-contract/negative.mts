import { decodeEvidenceZip } from '../../../src/github/owner-addition-evidence-zip.mts';

const externalArtifact: unknown = Buffer.alloc(0);
const decodedBytes: string = decodeEvidenceZip(externalArtifact);
void decodedBytes;
