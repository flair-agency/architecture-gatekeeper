import { materializeReviewWorkspace } from '../../../src/review-inputs/materialize-review-workspace.mts';
import { validateLoopbackEndpoint } from '../../../src/review-inputs/review-security-proxy.mts';

declare const packet: unknown;
declare const options: { readonly parentDirectory: unknown; readonly limits: unknown };
declare const endpoint: unknown;

const workspace = materializeReviewWorkspace(packet, options);
const directory: string = workspace.directory;
const manifestPath: string = workspace.manifestPath;
const cleanup: () => void = workspace.cleanup;
const url: URL = validateLoopbackEndpoint(endpoint);
void [directory, manifestPath, cleanup, url];
