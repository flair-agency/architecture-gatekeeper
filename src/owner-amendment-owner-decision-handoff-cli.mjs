import { runOwnerAmendmentOwnerDecisionHandoff } from './owner-amendment/owner-amendment-owner-decision-handoff-cli.mts';

export { runOwnerAmendmentOwnerDecisionHandoff };

if (import.meta.url === `file://${process.argv[1]}`) {
  runOwnerAmendmentOwnerDecisionHandoff().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'OWNER_DECISION_TAG_TRANSPORTED_AND_READ_BACK') process.exitCode = 1;
  });
}
