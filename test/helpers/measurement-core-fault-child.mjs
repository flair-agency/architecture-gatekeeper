import assert from 'node:assert/strict';
import { closeSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { beginMeasurement, resumeMeasurement } from '../../dist/measurement.mjs';
const [root, directory, scenario] = process.argv.slice(2);
process.chdir(root);
if (scenario === 'cwd-option' || scenario === 'cwd-environment') {
  const inside = join(root, 'private-records'); mkdirSync(inside, { mode: 0o700 });
  process.env.AGK_MEASUREMENT_DIR = inside;
  const options = scenario === 'cwd-option' ? { directory: inside } : {};
  assert.equal(beginMeasurement({ route: 'manual', ...options }).id, null);
  assert.deepEqual(readdirSync(inside), []);
  const external = beginMeasurement({ route: 'manual', directory });
  assert.ok(external.id); external.finish();
} else {
  const attempt = beginMeasurement({ route: 'manual', cwd: root, directory });
  assert.ok(attempt.id);
  process.stderr.write = () => { throw new Error('warning sink unavailable'); };
  if (scenario === 'closed-warning') { closeSync(process.stderr.fd); assert.equal(beginMeasurement({ route: 'manual', directory: '/unavailable' }).id, null); }
  if (scenario === 'setup-warning') assert.equal(beginMeasurement({ route: 'manual', directory: '/unavailable' }).id, null);
  if (scenario === 'request-warning') assert.doesNotThrow(() => attempt.request({ get prompt() { throw new Error('capture unavailable'); } }));
  if (scenario === 'finish-warning') { rmSync(directory, { recursive: true }); assert.doesNotThrow(() => attempt.finish()); }
  if (scenario === 'resume-warning') assert.equal(resumeMeasurement(directory, 'not-an-attempt').id, null);
}
