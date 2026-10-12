import { materializeReviewWorkspace } from '../../../src/materialize-review-workspace.mjs';
import { validateLoopbackEndpoint } from '../../../src/review-security-proxy.mjs';

const wrongPacket = materializeReviewWorkspace({ version: 1 }, { parentDirectory: 42, limits: 'large' });
const wrongEndpoint = validateLoopbackEndpoint({ endpointUrl: 'http://localhost:54321' });
const invalidCall: () => string = wrongPacket.cleanup;
void [wrongEndpoint, invalidCall];
