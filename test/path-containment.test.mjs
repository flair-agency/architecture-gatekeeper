import test from 'node:test';
import assert from 'node:assert/strict';
import { win32, posix } from 'node:path';
import { containsPath } from '../src/review-input-path.mjs';

test('review output containment classifies native Windows and POSIX checkout boundaries', () => {
  for (const [paths, root, inside, sibling, temp, otherDrive] of [
    [win32, 'C:\\work\\repo', 'C:\\work\\repo\\decision.json', 'C:\\work\\repository\\decision.json', 'C:\\Users\\runner\\AppData\\Local\\Temp\\decision.json', 'D:\\temp\\decision.json'],
    [posix, '/work/repo', '/work/repo/decision.json', '/work/repository/decision.json', '/tmp/decision.json', '/other/decision.json'],
  ]) {
    assert.equal(containsPath(root, root, paths), true);
    assert.equal(containsPath(root, inside, paths), true);
    for (const outside of [sibling, temp, otherDrive, paths.dirname(root)]) assert.equal(containsPath(root, outside, paths), false);
  }
});
