import test from 'node:test';
import assert from 'node:assert/strict';
import { validateOwnerAmendmentBlockSemanticRecord as sourceFlatExport } from '../src/owner-amendment-block-semantic-record.mjs';
import { validateOwnerAmendmentBlockSemanticRecord as sourceImplementationExport } from '../src/owner-amendment/owner-amendment-block-semantic-record.mts';
import { validateOwnerAmendmentBlockSemanticRecord as flatExport } from '../dist/owner-amendment-block-semantic-record.mjs';
import { validateOwnerAmendmentBlockSemanticRecord as implementationExport } from '../dist/owner-amendment/owner-amendment-block-semantic-record.mjs';

test('source and emitted flat BLOCK exports remain the implementation function and reject malformed record bytes', () => {
  assert.equal(sourceFlatExport, sourceImplementationExport);
  assert.equal(flatExport, implementationExport);
  for (const validate of [sourceFlatExport, flatExport]) {
    for (const bytes of [undefined, Buffer.alloc(0), Buffer.from('{'), Buffer.alloc(8_193)]) {
      assert.throws(() => validate({ bytes }), Error);
    }
  }
});
