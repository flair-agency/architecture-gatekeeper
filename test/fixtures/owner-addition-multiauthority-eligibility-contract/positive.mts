import { validateMultiAuthorityEligibility as groupedValidate,
  validateMultiAuthorityEligibilitySchema as groupedValidateSchema } from '../../../src/owner-addition/multi-authority-eligibility.mts';
import { validateMultiAuthorityEligibility as flatValidate,
  validateMultiAuthorityEligibilitySchema as flatValidateSchema } from '../../../src/owner-addition-multiauthority.mts';

declare const rawDecisionJson: unknown;
declare const selectedSchema: unknown;
declare const selectedProvenance: unknown;

const groupedObserved: unknown = groupedValidate(rawDecisionJson, selectedSchema, selectedProvenance);
const flatObserved: unknown = flatValidate(rawDecisionJson, selectedSchema, selectedProvenance);
const groupedSchemaResult: void = groupedValidateSchema(selectedSchema);
const flatSchemaResult: void = flatValidateSchema(selectedSchema);

void [groupedObserved, flatObserved, groupedSchemaResult, flatSchemaResult];
