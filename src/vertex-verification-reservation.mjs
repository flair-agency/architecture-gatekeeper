/** Internal counter for the owner-selected Issue334 five-dispatch verification allocation. */
import { fstatSync, fsyncSync, readSync, writeSync } from 'node:fs';

const HEADER = 'AGK334-V1\n';
const MAXIMUM = 5;
const MAX_BYTES = Buffer.byteLength(HEADER) + MAXIMUM * 2;

function inspect(fd) {
  const stat = fstatSync(fd);
  if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) !== 0 ||
      (typeof process.getuid === 'function' && stat.uid !== process.getuid()) ||
      stat.size > MAX_BYTES) {
    throw new Error('Verification counter requires a private regular file.');
  }
  return stat;
}

function readCount(fd, stat) {
  const bytes = Buffer.alloc(stat.size);
  if (readSync(fd, bytes, 0, bytes.length, 0) !== bytes.length) {
    throw new Error('Verification counter is incomplete.');
  }
  const text = bytes.toString('utf8');
  for (let count = 0; count <= MAXIMUM; count++) {
    const expected = HEADER + Array.from({ length: count }, (_, index) => `${index + 1}\n`).join('');
    if (text === expected) return count;
  }
  throw new Error('Verification counter is invalid.');
}

function append(fd, text, offset) {
  const bytes = Buffer.from(text);
  if (writeSync(fd, bytes, 0, bytes.length, offset) !== bytes.length) {
    throw new Error('Verification counter write is incomplete.');
  }
  fsyncSync(fd);
}

/**
 * Initialize only after the trusted launcher successfully creates the fixed
 * allocation file exclusively (for example, openSync(path, 'wx+', 0o600)).
 * An empty reopened file is not proof of creation and must never use this path.
 */
export function initializeVertexVerificationLedger(fd) {
  if (!Number.isSafeInteger(fd) || fd < 3) throw new Error('Verification counter requires a caller-owned file descriptor.');
  const stat = inspect(fd);
  if (stat.size !== 0) throw new Error('Verification counter initialization requires a newly created empty file.');
  append(fd, HEADER, 0);
}

/**
 * The trusted launcher owns one fixed, private, exclusively accessed ledger
 * file for this allocation. It creates/opens the file, durably establishes its
 * directory entry, retains it across sessions/restarts, and closes the fd only
 * after the proxy is stopped. It must not create a new ledger to reset a spent
 * allocation. This helper does not establish pathname privacy, exclusive host
 * custody or cross-job transport. Multiple processes must not write concurrently.
 *
 * Returned capability reserves synchronously before upstream dispatch. A write
 * or fsync failure denies dispatch and never refunds a previously recorded
 * attempt. Reopening the same ledger resumes its count; corruption fails closed.
 */
export function createVertexVerificationReservation(fd) {
  if (!Number.isSafeInteger(fd) || fd < 3) throw new Error('Verification counter requires a caller-owned file descriptor.');
  const initial = inspect(fd);
  readCount(fd, initial);
  const identity = { dev: initial.dev, ino: initial.ino };
  return () => {
    try {
      const stat = inspect(fd);
      if (stat.dev !== identity.dev || stat.ino !== identity.ino) return false;
      const count = readCount(fd, stat);
      if (count === MAXIMUM) return false;
      append(fd, `${count + 1}\n`, stat.size);
      return true;
    } catch {
      return false;
    }
  };
}
