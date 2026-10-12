import { runOwnerAmendmentHandoff } from './owner-amendment/owner-amendment-handoff-cli.mts';

export { runOwnerAmendmentHandoff };

if (import.meta.url === `file://${process.argv[1]}`) {
  runOwnerAmendmentHandoff().then(result => {
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.status !== 'TAG_TRANSPORTED_AND_READ_BACK') process.exitCode = 1;
  });
}
