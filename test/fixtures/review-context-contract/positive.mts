import { materializeRegularGitSnapshot } from '../../../src/review-inputs/materialize-regular-git-snapshot.mts';
import { prepareReviewFileContext } from '../../../src/review-inputs/prepare-review-file-context.mts';
import { prepareReviewContext as prepareReviewContextFlat } from '../../../src/prepare-review-context.mjs';
import { prepareReviewContext } from '../../../src/review-inputs/prepare-review-context.mts';

const snapshot = materializeRegularGitSnapshot({
  root: '/checkout', commit: 'a'.repeat(40), path: 'docs/architecture.md', outputPath: '/tmp/snapshot', maxBytes: 4096,
});
materializeRegularGitSnapshot({ root: '/checkout', commit: 'a'.repeat(40), path: 'docs/architecture.md', outputPath: Buffer.from('/tmp/snapshot-buffer') });
materializeRegularGitSnapshot({ root: '/checkout', commit: 'a'.repeat(40), path: 'docs/architecture.md', outputPath: new URL('file:///tmp/snapshot-url') });
materializeRegularGitSnapshot({ root: '/checkout', commit: 'a'.repeat(40), path: 'docs/architecture.md', outputPath: 3 });
const fileContext = prepareReviewFileContext({
  root: '/checkout', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedSha: 'c'.repeat(40),
  referencePaths: ['docs/architecture.md'], limits: { maxFiles: 8, maxFileBytes: 4096, maxTotalBytes: 16_384 },
});
const taskContext = {
  root: '/checkout', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedSha: 'c'.repeat(40),
  repository: 'example/repository', promptPath: '/tmp/prompt.md', outputPath: '/tmp/context.md',
  authorityRouteSelected: 'true', authorityLimitsBase64: 'e30=', authorityProfile: 'v1', policyVersion: '',
};
const preparedFromLeaf = prepareReviewContext(taskContext);
const preparedFromFacade = prepareReviewContextFlat(taskContext);

void [snapshot.sha256, fileContext.version, preparedFromLeaf.finalPromptBytes, preparedFromFacade.changedPaths];
