import test from 'node:test';
import assert from 'node:assert/strict';
import { createVertexVerificationReservation } from '../dist/vertex-verification-reservation.mjs';

test('session cap allows ten pre-send reservations and denies the eleventh', () => {
  const counter = createVertexVerificationReservation();
  for (let i = 0; i < 10; i++) assert.equal(counter.reserveDispatch(), true);
  assert.equal(counter.snapshot().count, 10);
  assert.equal(counter.reserveDispatch(), false);
  assert.deepEqual(counter.snapshot(), { count: 10, maximum: 10 });
});

test('each counter starts fresh and failed or uncertain sends remain counted', () => {
  const first = createVertexVerificationReservation();
  assert.equal(first.reserveDispatch(), true); // A later transport failure does not refund this send.
  assert.deepEqual(first.snapshot(), { count: 1, maximum: 10 });
  const second = createVertexVerificationReservation();
  assert.deepEqual(second.snapshot(), { count: 0, maximum: 10 });
});

test('journal failure blocks the send and leaves the attempted count unknown to diagnostics', () => {
  let observed;
  const counter = createVertexVerificationReservation(count => { observed = count; return false; });
  assert.equal(counter.reserveDispatch(), false);
  assert.equal(observed, 1);
  assert.deepEqual(counter.snapshot(), { count: 0, maximum: 10 });
});

test('journal callback runs synchronously before each allowed send and is bounded by the session cap', () => {
  const journal = [];
  const counter = createVertexVerificationReservation(count => { journal.push(count); return true; });
  for (let i = 0; i < 11; i++) counter.reserveDispatch();
  assert.deepEqual(journal, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(counter.snapshot().count, 10);
});
