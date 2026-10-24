import { handoffOwnerAmendmentOwnerInitiated } from '../dist/owner-amendment-owner-initiated-handoff.mjs';

const result = await handoffOwnerAmendmentOwnerInitiated({
  repository: process.env.GITHUB_REPOSITORY,
  selfRoot: process.cwd(),
  baseSha: process.env.AMENDMENT_BASE_SHA,
  bSha: process.env.AMENDMENT_B_SHA,
  purpose: process.env.AMENDMENT_PURPOSE,
  rulesetId: Number(process.env.OWNER_AMENDMENT_TAG_RULESET_ID),
  token: process.env.GH_TOKEN,
  tagger: {
    name: 'Architecture Gatekeeper',
    email: 'architecture-gatekeeper@users.noreply.github.com',
    date: new Date().toISOString(),
  },
});
console.log(JSON.stringify(result));
if (result.status === 'INCOMPLETE') process.exitCode = 1;
