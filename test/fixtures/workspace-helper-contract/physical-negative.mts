import { materializeReviewWorkspace } from '../../../src/review-inputs/materialize-review-workspace.mts';
import { validateLoopbackEndpoint } from '../../../src/review-inputs/review-security-proxy.mts';

declare const packet: unknown;
declare const options: { readonly parentDirectory: unknown; readonly limits: unknown };
const workspace = materializeReviewWorkspace(packet, options);
const wrongDirectory: { authenticated: true } = workspace.directory;
workspace.directory = '/candidate/path';
workspace.manifestPath = '/candidate/manifest';
const wrongCleanup: () => string = workspace.cleanup;
const wrongUrl: string = validateLoopbackEndpoint(1);
void [wrongDirectory, wrongCleanup, wrongUrl];
