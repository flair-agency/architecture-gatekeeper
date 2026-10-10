import { materializeReviewWorkspace } from '../../../src/materialize-review-workspace.mjs';
import { validateLoopbackEndpoint } from '../../../src/review-security-proxy.mjs';

declare const packet: unknown;
declare const options: { readonly parentDirectory: unknown; readonly limits: unknown };

const workspace = materializeReviewWorkspace(packet, options);
const directory: string = workspace.directory;
const manifestPath: string = workspace.manifestPath;
const cleanup: () => void = workspace.cleanup;
const url: URL = validateLoopbackEndpoint('http://127.0.0.1:54321');
void [directory, manifestPath, cleanup, url];
