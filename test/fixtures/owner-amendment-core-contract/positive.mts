import { digestOwnerAmendmentRecord as digestFlat, parseOwnerAmendmentBlockRecord as parseFlat,
  validateOwnerAmendmentG0TagEnvelope as validateEnvelopeFlat, validateOwnerAmendmentG0Procedure as validateProcedureFlat } from '../../../src/owner-amendment.mjs';
import { digestOwnerAmendmentRecord, parseOwnerAmendmentBlockRecord, validateOwnerAmendmentG0TagEnvelope,
  validateOwnerAmendmentG0Procedure, type ValidateOwnerAmendmentG0ProcedureInput,
  type ValidateOwnerAmendmentG0TagEnvelopeInput } from '../../../src/owner-amendment/owner-amendment.mts';

declare const externalBytes: unknown;
declare const externalValue: unknown;
declare const procedureInput: ValidateOwnerAmendmentG0ProcedureInput;
declare const envelopeInput: ValidateOwnerAmendmentG0TagEnvelopeInput;

const digest: string = digestOwnerAmendmentRecord(externalValue);
const parsed = parseOwnerAmendmentBlockRecord(externalBytes);
const parsedPurpose: string = parsed.purpose;
const parsedPreviousAuthorityDigest: string = parsed.authority.previousSha256;
const parsedNewAuthorityDigest: string = parsed.authority.newSha256;
parsed.purpose = 'caller may mutate the plain parsed JSON result';
const flatParsed = parseFlat(externalBytes);
const flatPurpose: string = flatParsed.purpose;
const envelope = validateOwnerAmendmentG0TagEnvelope(envelopeInput);
const flatEnvelope = validateEnvelopeFlat(envelopeInput);
const profile: 'self-g0' = envelope.profile;
const returnedSha: unknown = envelope.tagObjectOid;
const envelopeReviewDigest: string = envelope.reviewRecordSha256;
const envelopeAmendmentDigest: string = envelope.amendmentRecordSha256;
const envelopeAttestationDigest: string = envelope.attestationBundleSha256;
const procedure = validateOwnerAmendmentG0Procedure(procedureInput);
const flatProcedure = validateProcedureFlat(procedureInput);
const route: 'VALID_G0_AMENDMENT' = procedure.procedure;
const authenticationObservation: 'not_verified' = procedure.principalAuthentication;
const reviewDigest: string = procedure.reviewRecordSha256;
const callerAuthorityId: unknown = procedure.authorityId;
const flatDigest: string = digestFlat(externalValue);
void [digest, parsedPurpose, parsedPreviousAuthorityDigest, parsedNewAuthorityDigest, flatPurpose, profile, returnedSha,
  envelopeReviewDigest, envelopeAmendmentDigest, envelopeAttestationDigest, route, authenticationObservation,
  reviewDigest, callerAuthorityId, flatEnvelope, flatProcedure, flatDigest];
