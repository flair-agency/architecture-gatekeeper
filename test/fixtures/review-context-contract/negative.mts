import { prepareReviewFileContext } from '../../../src/review-inputs/prepare-review-file-context.mts';

prepareReviewFileContext({
  root: '/checkout', baseSha: 'a'.repeat(40), headSha: 'b'.repeat(40), reviewedSha: 'c'.repeat(40),
  referencePaths: ['docs/architecture.md'],
  limits: { maxFiles: 'many', maxFileBytes: 4096, maxTotalBytes: 16_384 },
});
