#!/usr/bin/env node
import { runLegacyCiAuthorityCli } from './ci-review/legacy-ci-authority-preparer.mts';
export { prepareLegacyAuthority, validateLegacyAuthorityDecision } from './ci-review/legacy-ci-authority-preparer.mts';

if (process.argv[1]?.endsWith('/prepare-legacy-ci-authority.mjs')) runLegacyCiAuthorityCli();
