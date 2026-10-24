import type { OwnerAmendmentSemanticEligibilityProducerDependencies as Dependencies } from '../../../src/owner-amendment/owner-amendment-semantic-eligibility.mts';

type ProtectedInputs = ReturnType<Dependencies['resolveProtectedInputs']>;
type ProtectedAuthoritySet = ProtectedInputs['authoritySet'];
type ProtectedAuthorityMember = ProtectedAuthoritySet['members'][number];
type ProtectedChange = ProtectedInputs['changes'][number];
type ProtectedSelection = ReturnType<Dependencies['resolveProtectedSelection']>;
type SelectedGatekeeper = ProtectedSelection['selectedGatekeeper'];
type GatekeeperPackage = NonNullable<SelectedGatekeeper['package']>;
type TriggerResult = ReturnType<NonNullable<Dependencies['validateTriggerProvenance']>>;
type AmendmentResult = Exclude<ReturnType<Dependencies['validateAmendmentRecord']>, { triggerProfile: 'owner-initiated-self-v1' }>;
type SelfAmendment = Extract<AmendmentResult, { triggerProfile: 'completed-owner-decision-self-v1' }>;
type TagResult = ReturnType<Dependencies['validateTag']>;

// protected input result cannot be null.
const nullProtectedInputs: ProtectedInputs = null;
// protected input result must include its required validated fields.
const emptyProtectedInputs: ProtectedInputs = {};
// protected Authority Set cannot be null.
const nullProtectedAuthoritySet: ProtectedAuthoritySet = null;
// protected Authority Set must include its required validated fields.
const emptyProtectedAuthoritySet: ProtectedAuthoritySet = {};
// protected Authority Set member cannot be null.
const nullProtectedAuthorityMember: ProtectedAuthorityMember = null;
// protected Authority Set member must include its required validated fields.
const emptyProtectedAuthorityMember: ProtectedAuthorityMember = {};
// protected Authority Set change cannot be null.
const nullProtectedChange: ProtectedChange = null;
// protected Authority Set change must include its required validated fields.
const emptyProtectedChange: ProtectedChange = {};
// protected protected-selection result cannot be null.
const nullProtectedSelection: ProtectedSelection = null;
// protected protected-selection result must include its required validated fields.
const emptyProtectedSelection: ProtectedSelection = {};
// selected Gatekeeper identity cannot be null.
const nullSelectedGatekeeper: SelectedGatekeeper = null;
// selected Gatekeeper identity must include its required validated fields.
const emptySelectedGatekeeper: SelectedGatekeeper = {};
// non-null selected Gatekeeper package cannot be null.
const nullGatekeeperPackage: GatekeeperPackage = null;
// non-null selected Gatekeeper package must include its required validated fields.
const emptyGatekeeperPackage: GatekeeperPackage = {};
// trigger provenance result cannot be null.
const nullTriggerResult: TriggerResult = null;
// trigger provenance result must include its required validated fields.
const emptyTriggerResult: TriggerResult = {};
// AmendmentRecord result cannot be null.
const nullAmendmentResult: AmendmentResult = null;
// AmendmentRecord result must include its required validated fields.
const emptyAmendmentResult: AmendmentResult = {};
// self AmendmentRecord result cannot be null.
const nullSelfAmendment: SelfAmendment = null;
// self AmendmentRecord result must include its required validated fields.
const emptySelfAmendment: SelfAmendment = {};
// tag validation result cannot be null.
const nullTagResult: TagResult = null;
// tag validation result must include its required validated fields.
const emptyTagResult: TagResult = {};

declare const protectedInputs: ProtectedInputs;
const { baseBranch: omittedBaseBranchFromProtectedInputs, ...withoutBaseBranchFromProtectedInputs } = protectedInputs;
void omittedBaseBranchFromProtectedInputs;
// ProtectedInputs.baseBranch is required by the observed validation path.
const missingBaseBranchFromProtectedInputs: ProtectedInputs = withoutBaseBranchFromProtectedInputs;
const { policyBytes: omittedPolicyBytesFromProtectedInputs, ...withoutPolicyBytesFromProtectedInputs } = protectedInputs;
void omittedPolicyBytesFromProtectedInputs;
// ProtectedInputs.policyBytes is required by the observed validation path.
const missingPolicyBytesFromProtectedInputs: ProtectedInputs = withoutPolicyBytesFromProtectedInputs;
const { manifestBytes: omittedManifestBytesFromProtectedInputs, ...withoutManifestBytesFromProtectedInputs } = protectedInputs;
void omittedManifestBytesFromProtectedInputs;
// ProtectedInputs.manifestBytes is required by the observed validation path.
const missingManifestBytesFromProtectedInputs: ProtectedInputs = withoutManifestBytesFromProtectedInputs;
const { authoritySet: omittedAuthoritySetFromProtectedInputs, ...withoutAuthoritySetFromProtectedInputs } = protectedInputs;
void omittedAuthoritySetFromProtectedInputs;
// ProtectedInputs.authoritySet is required by the observed validation path.
const missingAuthoritySetFromProtectedInputs: ProtectedInputs = withoutAuthoritySetFromProtectedInputs;
const { changes: omittedChangesFromProtectedInputs, ...withoutChangesFromProtectedInputs } = protectedInputs;
void omittedChangesFromProtectedInputs;
// ProtectedInputs.changes is required by the observed validation path.
const missingChangesFromProtectedInputs: ProtectedInputs = withoutChangesFromProtectedInputs;
const { diffBytes: omittedDiffBytesFromProtectedInputs, ...withoutDiffBytesFromProtectedInputs } = protectedInputs;
void omittedDiffBytesFromProtectedInputs;
// ProtectedInputs.diffBytes is required by the observed validation path.
const missingDiffBytesFromProtectedInputs: ProtectedInputs = withoutDiffBytesFromProtectedInputs;

declare const authoritySet: ProtectedAuthoritySet;
const { digest: omittedDigestFromAuthoritySet, ...withoutDigestFromAuthoritySet } = authoritySet;
void omittedDigestFromAuthoritySet;
// ProtectedAuthoritySet.digest is required by the observed validation path.
const missingDigestFromAuthoritySet: ProtectedAuthoritySet = withoutDigestFromAuthoritySet;
const { members: omittedMembersFromAuthoritySet, ...withoutMembersFromAuthoritySet } = authoritySet;
void omittedMembersFromAuthoritySet;
// ProtectedAuthoritySet.members is required by the observed validation path.
const missingMembersFromAuthoritySet: ProtectedAuthoritySet = withoutMembersFromAuthoritySet;

declare const member: ProtectedAuthorityMember;
const { id: omittedIdFromMember, ...withoutIdFromMember } = member;
void omittedIdFromMember;
// ProtectedAuthorityMember.id is required by the observed validation path.
const missingIdFromMember: ProtectedAuthorityMember = withoutIdFromMember;
const { repository: omittedRepositoryFromMember, ...withoutRepositoryFromMember } = member;
void omittedRepositoryFromMember;
// ProtectedAuthorityMember.repository is required by the observed validation path.
const missingRepositoryFromMember: ProtectedAuthorityMember = withoutRepositoryFromMember;
const { resolvedCommit: omittedResolvedCommitFromMember, ...withoutResolvedCommitFromMember } = member;
void omittedResolvedCommitFromMember;
// ProtectedAuthorityMember.resolvedCommit is required by the observed validation path.
const missingResolvedCommitFromMember: ProtectedAuthorityMember = withoutResolvedCommitFromMember;
const { path: omittedPathFromMember, ...withoutPathFromMember } = member;
void omittedPathFromMember;
// ProtectedAuthorityMember.path is required by the observed validation path.
const missingPathFromMember: ProtectedAuthorityMember = withoutPathFromMember;
const { byteLength: omittedByteLengthFromMember, ...withoutByteLengthFromMember } = member;
void omittedByteLengthFromMember;
// ProtectedAuthorityMember.byteLength is required by the observed validation path.
const missingByteLengthFromMember: ProtectedAuthorityMember = withoutByteLengthFromMember;
const { sha256: omittedSha256FromMember, ...withoutSha256FromMember } = member;
void omittedSha256FromMember;
// ProtectedAuthorityMember.sha256 is required by the observed validation path.
const missingSha256FromMember: ProtectedAuthorityMember = withoutSha256FromMember;
const { bytes: omittedBytesFromMember, ...withoutBytesFromMember } = member;
void omittedBytesFromMember;
// ProtectedAuthorityMember.bytes is required by the observed validation path.
const missingBytesFromMember: ProtectedAuthorityMember = withoutBytesFromMember;

declare const change: ProtectedChange;
const { path: omittedPathFromChange, ...withoutPathFromChange } = change;
void omittedPathFromChange;
// ProtectedChange.path is required by the observed validation path.
const missingPathFromChange: ProtectedChange = withoutPathFromChange;
const { beforeBytes: omittedBeforeBytesFromChange, ...withoutBeforeBytesFromChange } = change;
void omittedBeforeBytesFromChange;
// ProtectedChange.beforeBytes is required by the observed validation path.
const missingBeforeBytesFromChange: ProtectedChange = withoutBeforeBytesFromChange;
const { afterBytes: omittedAfterBytesFromChange, ...withoutAfterBytesFromChange } = change;
void omittedAfterBytesFromChange;
// ProtectedChange.afterBytes is required by the observed validation path.
const missingAfterBytesFromChange: ProtectedChange = withoutAfterBytesFromChange;

declare const selection: ProtectedSelection;
const { selectedProducer: omittedSelectedProducerFromSelection, ...withoutSelectedProducerFromSelection } = selection;
void omittedSelectedProducerFromSelection;
// ProtectedSelection.selectedProducer is required by the observed validation path.
const missingSelectedProducerFromSelection: ProtectedSelection = withoutSelectedProducerFromSelection;
const { selectedGatekeeper: omittedSelectedGatekeeperFromSelection, ...withoutSelectedGatekeeperFromSelection } = selection;
void omittedSelectedGatekeeperFromSelection;
// ProtectedSelection.selectedGatekeeper is required by the observed validation path.
const missingSelectedGatekeeperFromSelection: ProtectedSelection = withoutSelectedGatekeeperFromSelection;

declare const selectedGatekeeper: SelectedGatekeeper;
const { repository: omittedRepositoryFromSelectedGatekeeper, ...withoutRepositoryFromSelectedGatekeeper } = selectedGatekeeper;
void omittedRepositoryFromSelectedGatekeeper;
// SelectedGatekeeper.repository is required by the observed validation path.
const missingRepositoryFromSelectedGatekeeper: SelectedGatekeeper = withoutRepositoryFromSelectedGatekeeper;
const { revision: omittedRevisionFromSelectedGatekeeper, ...withoutRevisionFromSelectedGatekeeper } = selectedGatekeeper;
void omittedRevisionFromSelectedGatekeeper;
// SelectedGatekeeper.revision is required by the observed validation path.
const missingRevisionFromSelectedGatekeeper: SelectedGatekeeper = withoutRevisionFromSelectedGatekeeper;
const { package: omittedPackageFromSelectedGatekeeper, ...withoutPackageFromSelectedGatekeeper } = selectedGatekeeper;
void omittedPackageFromSelectedGatekeeper;
// SelectedGatekeeper.package is required by the observed validation path.
const missingPackageFromSelectedGatekeeper: SelectedGatekeeper = withoutPackageFromSelectedGatekeeper;

declare const gatekeeperPackage: GatekeeperPackage;
const { name: omittedNameFromGatekeeperPackage, ...withoutNameFromGatekeeperPackage } = gatekeeperPackage;
void omittedNameFromGatekeeperPackage;
// GatekeeperPackage.name is required by the observed validation path.
const missingNameFromGatekeeperPackage: GatekeeperPackage = withoutNameFromGatekeeperPackage;
const { version: omittedVersionFromGatekeeperPackage, ...withoutVersionFromGatekeeperPackage } = gatekeeperPackage;
void omittedVersionFromGatekeeperPackage;
// GatekeeperPackage.version is required by the observed validation path.
const missingVersionFromGatekeeperPackage: GatekeeperPackage = withoutVersionFromGatekeeperPackage;
const { integrity: omittedIntegrityFromGatekeeperPackage, ...withoutIntegrityFromGatekeeperPackage } = gatekeeperPackage;
void omittedIntegrityFromGatekeeperPackage;
// GatekeeperPackage.integrity is required by the observed validation path.
const missingIntegrityFromGatekeeperPackage: GatekeeperPackage = withoutIntegrityFromGatekeeperPackage;

declare const trigger: TriggerResult;
const { status: omittedStatusFromTrigger, ...withoutStatusFromTrigger } = trigger;
void omittedStatusFromTrigger;
// TriggerResult.status is required by the observed validation path.
const missingStatusFromTrigger: TriggerResult = withoutStatusFromTrigger;
const { repository: omittedRepositoryFromTrigger, ...withoutRepositoryFromTrigger } = trigger;
void omittedRepositoryFromTrigger;
// TriggerResult.repository is required by the observed validation path.
const missingRepositoryFromTrigger: TriggerResult = withoutRepositoryFromTrigger;
const { baseSha: omittedBaseShaFromTrigger, ...withoutBaseShaFromTrigger } = trigger;
void omittedBaseShaFromTrigger;
// TriggerResult.baseSha is required by the observed validation path.
const missingBaseShaFromTrigger: TriggerResult = withoutBaseShaFromTrigger;
const { triggerProfile: omittedTriggerProfileFromTrigger, ...withoutTriggerProfileFromTrigger } = trigger;
void omittedTriggerProfileFromTrigger;
// TriggerResult.triggerProfile is required by the observed validation path.
const missingTriggerProfileFromTrigger: TriggerResult = withoutTriggerProfileFromTrigger;
const { triggerReviewRecordSha256: omittedTriggerReviewRecordSha256FromTrigger, ...withoutTriggerReviewRecordSha256FromTrigger } = trigger;
void omittedTriggerReviewRecordSha256FromTrigger;
// TriggerResult.triggerReviewRecordSha256 is required by the observed validation path.
const missingTriggerReviewRecordSha256FromTrigger: TriggerResult = withoutTriggerReviewRecordSha256FromTrigger;
const { workflowPath: omittedWorkflowPathFromTrigger, ...withoutWorkflowPathFromTrigger } = trigger;
void omittedWorkflowPathFromTrigger;
// TriggerResult.workflowPath is required by the observed validation path.
const missingWorkflowPathFromTrigger: TriggerResult = withoutWorkflowPathFromTrigger;
const { workflowSha: omittedWorkflowShaFromTrigger, ...withoutWorkflowShaFromTrigger } = trigger;
void omittedWorkflowShaFromTrigger;
// TriggerResult.workflowSha is required by the observed validation path.
const missingWorkflowShaFromTrigger: TriggerResult = withoutWorkflowShaFromTrigger;
const { workflowRef: omittedWorkflowRefFromTrigger, ...withoutWorkflowRefFromTrigger } = trigger;
void omittedWorkflowRefFromTrigger;
// TriggerResult.workflowRef is required by the observed validation path.
const missingWorkflowRefFromTrigger: TriggerResult = withoutWorkflowRefFromTrigger;
const { runId: omittedRunIdFromTrigger, ...withoutRunIdFromTrigger } = trigger;
void omittedRunIdFromTrigger;
// TriggerResult.runId is required by the observed validation path.
const missingRunIdFromTrigger: TriggerResult = withoutRunIdFromTrigger;
const { runAttempt: omittedRunAttemptFromTrigger, ...withoutRunAttemptFromTrigger } = trigger;
void omittedRunAttemptFromTrigger;
// TriggerResult.runAttempt is required by the observed validation path.
const missingRunAttemptFromTrigger: TriggerResult = withoutRunAttemptFromTrigger;

declare const amendment: AmendmentResult;
const { status: omittedStatusFromAmendment, ...withoutStatusFromAmendment } = amendment;
void omittedStatusFromAmendment;
// AmendmentResult.status is required by the observed validation path.
const missingStatusFromAmendment: AmendmentResult = withoutStatusFromAmendment;
const { repository: omittedRepositoryFromAmendment, ...withoutRepositoryFromAmendment } = amendment;
void omittedRepositoryFromAmendment;
// AmendmentResult.repository is required by the observed validation path.
const missingRepositoryFromAmendment: AmendmentResult = withoutRepositoryFromAmendment;
const { baseSha: omittedBaseShaFromAmendment, ...withoutBaseShaFromAmendment } = amendment;
void omittedBaseShaFromAmendment;
// AmendmentResult.baseSha is required by the observed validation path.
const missingBaseShaFromAmendment: AmendmentResult = withoutBaseShaFromAmendment;
const { bSha: omittedBShaFromAmendment, ...withoutBShaFromAmendment } = amendment;
void omittedBShaFromAmendment;
// AmendmentResult.bSha is required by the observed validation path.
const missingBShaFromAmendment: AmendmentResult = withoutBShaFromAmendment;
const { policyRevision: omittedPolicyRevisionFromAmendment, ...withoutPolicyRevisionFromAmendment } = amendment;
void omittedPolicyRevisionFromAmendment;
// AmendmentResult.policyRevision is required by the observed validation path.
const missingPolicyRevisionFromAmendment: AmendmentResult = withoutPolicyRevisionFromAmendment;
const { triggerProfile: omittedTriggerProfileFromAmendment, ...withoutTriggerProfileFromAmendment } = amendment;
void omittedTriggerProfileFromAmendment;
// AmendmentResult.triggerProfile is required by the observed validation path.
const missingTriggerProfileFromAmendment: AmendmentResult = withoutTriggerProfileFromAmendment;
const { triggerReviewRecordSha256: omittedTriggerReviewRecordSha256FromAmendment, ...withoutTriggerReviewRecordSha256FromAmendment } = amendment;
void omittedTriggerReviewRecordSha256FromAmendment;
// AmendmentResult.triggerReviewRecordSha256 is required by the observed validation path.
const missingTriggerReviewRecordSha256FromAmendment: AmendmentResult = withoutTriggerReviewRecordSha256FromAmendment;
const { priorAuthoritySetDigest: omittedPriorAuthoritySetDigestFromAmendment, ...withoutPriorAuthoritySetDigestFromAmendment } = amendment;
void omittedPriorAuthoritySetDigestFromAmendment;
// AmendmentResult.priorAuthoritySetDigest is required by the observed validation path.
const missingPriorAuthoritySetDigestFromAmendment: AmendmentResult = withoutPriorAuthoritySetDigestFromAmendment;
const { resultingAuthoritySetDigest: omittedResultingAuthoritySetDigestFromAmendment, ...withoutResultingAuthoritySetDigestFromAmendment } = amendment;
void omittedResultingAuthoritySetDigestFromAmendment;
// AmendmentResult.resultingAuthoritySetDigest is required by the observed validation path.
const missingResultingAuthoritySetDigestFromAmendment: AmendmentResult = withoutResultingAuthoritySetDigestFromAmendment;
const { changes: omittedChangesFromAmendment, ...withoutChangesFromAmendment } = amendment;
void omittedChangesFromAmendment;
// AmendmentResult.changes is required by the observed validation path.
const missingChangesFromAmendment: AmendmentResult = withoutChangesFromAmendment;
const { targetValidated: omittedTargetValidatedFromAmendment, ...withoutTargetValidatedFromAmendment } = amendment;
void omittedTargetValidatedFromAmendment;
// AmendmentResult.targetValidated is required by the observed validation path.
const missingTargetValidatedFromAmendment: AmendmentResult = withoutTargetValidatedFromAmendment;
const { purpose: omittedPurposeFromAmendment, ...withoutPurposeFromAmendment } = amendment;
void omittedPurposeFromAmendment;
// AmendmentResult.purpose is required by the observed validation path.
const missingPurposeFromAmendment: AmendmentResult = withoutPurposeFromAmendment;

declare const tag: TagResult;
const { status: omittedStatusFromTag, ...withoutStatusFromTag } = tag;
void omittedStatusFromTag;
// TagResult.status is required by the observed validation path.
const missingStatusFromTag: TagResult = withoutStatusFromTag;
const { repository: omittedRepositoryFromTag, ...withoutRepositoryFromTag } = tag;
void omittedRepositoryFromTag;
// TagResult.repository is required by the observed validation path.
const missingRepositoryFromTag: TagResult = withoutRepositoryFromTag;
const { baseSha: omittedBaseShaFromTag, ...withoutBaseShaFromTag } = tag;
void omittedBaseShaFromTag;
// TagResult.baseSha is required by the observed validation path.
const missingBaseShaFromTag: TagResult = withoutBaseShaFromTag;
const { bSha: omittedBShaFromTag, ...withoutBShaFromTag } = tag;
void omittedBShaFromTag;
// TagResult.bSha is required by the observed validation path.
const missingBShaFromTag: TagResult = withoutBShaFromTag;
const { triggerProfile: omittedTriggerProfileFromTag, ...withoutTriggerProfileFromTag } = tag;
void omittedTriggerProfileFromTag;
// TagResult.triggerProfile is required by the observed validation path.
const missingTriggerProfileFromTag: TagResult = withoutTriggerProfileFromTag;
const { triggerReviewRecordSha256: omittedTriggerReviewRecordSha256FromTag, ...withoutTriggerReviewRecordSha256FromTag } = tag;
void omittedTriggerReviewRecordSha256FromTag;
// TagResult.triggerReviewRecordSha256 is required by the observed validation path.
const missingTriggerReviewRecordSha256FromTag: TagResult = withoutTriggerReviewRecordSha256FromTag;
const { amendmentRecordSha256: omittedAmendmentRecordSha256FromTag, ...withoutAmendmentRecordSha256FromTag } = tag;
void omittedAmendmentRecordSha256FromTag;
// TagResult.amendmentRecordSha256 is required by the observed validation path.
const missingAmendmentRecordSha256FromTag: TagResult = withoutAmendmentRecordSha256FromTag;
const { tagRef: omittedTagRefFromTag, ...withoutTagRefFromTag } = tag;
void omittedTagRefFromTag;
// TagResult.tagRef is required by the observed validation path.
const missingTagRefFromTag: TagResult = withoutTagRefFromTag;
const { tagObjectOid: omittedTagObjectOidFromTag, ...withoutTagObjectOidFromTag } = tag;
void omittedTagObjectOidFromTag;
// TagResult.tagObjectOid is required by the observed validation path.
const missingTagObjectOidFromTag: TagResult = withoutTagObjectOidFromTag;
const { observedTagRefOid: omittedObservedTagRefOidFromTag, ...withoutObservedTagRefOidFromTag } = tag;
void omittedObservedTagRefOidFromTag;
// TagResult.observedTagRefOid is required by the observed validation path.
const missingObservedTagRefOidFromTag: TagResult = withoutObservedTagRefOidFromTag;

declare const selfAmendment: SelfAmendment;
const { authorityId: omittedAuthorityIdFromSelfAmendment, ...withoutAuthorityIdFromSelfAmendment } = selfAmendment;
void omittedAuthorityIdFromSelfAmendment;
// authorityId is required for the self-amendment result profile.
const missingAuthorityIdFromSelfAmendment: SelfAmendment = withoutAuthorityIdFromSelfAmendment;
const { authorityPath: omittedAuthorityPathFromSelfAmendment, ...withoutAuthorityPathFromSelfAmendment } = selfAmendment;
void omittedAuthorityPathFromSelfAmendment;
// authorityPath is required for the self-amendment result profile.
const missingAuthorityPathFromSelfAmendment: SelfAmendment = withoutAuthorityPathFromSelfAmendment;

// The new profile requires explicit absence and retains the selected-target binding.
type OwnerInitiatedAmendment = Extract<ReturnType<Dependencies['validateAmendmentRecord']>, { triggerProfile: 'owner-initiated-self-v1' }>;
declare const ownerInitiated: OwnerInitiatedAmendment;
const { historicalTrigger: omittedhistoricalTrigger, ...withouthistoricalTrigger } = ownerInitiated;
void omittedhistoricalTrigger;
const missinghistoricalTrigger: OwnerInitiatedAmendment = withouthistoricalTrigger;
const { authorityId: omittedauthorityId, ...withoutauthorityId } = ownerInitiated;
void omittedauthorityId;
const missingauthorityId: OwnerInitiatedAmendment = withoutauthorityId;
const { authorityPath: omittedauthorityPath, ...withoutauthorityPath } = ownerInitiated;
void omittedauthorityPath;
const missingauthorityPath: OwnerInitiatedAmendment = withoutauthorityPath;
