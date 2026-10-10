import { prepareAuthoritySet } from '../../../src/prepare-authority-set.mjs';

prepareAuthoritySet({ selfRepository: 'owner/repo', selfRoot: 42, authorityRevision: 'a'.repeat(40), outputDir: '/tmp/out' });
