import { verifyLegacyValidationSelection } from '../../../src/ci-review/verify-legacy-validation-selection.mts';

const explicitPath: { validationPath: string | null } = verifyLegacyValidationSelection(
  '.codex/gatekeeper/decision.validation.json', '.codex/gatekeeper/decision.validation.json');
const explicitNull: { validationPath: string | null } = verifyLegacyValidationSelection('', '');
const unknownExternalPath: unknown = '.codex/gatekeeper/decision.validation.json';
const unknownAcceptance: { validationPath: string | null } = verifyLegacyValidationSelection(unknownExternalPath, unknownExternalPath);
void [explicitPath, explicitNull, unknownAcceptance];
