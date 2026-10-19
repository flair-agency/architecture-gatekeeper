import { readSync } from 'node:fs';

/** Read from the descriptor's current position into caller-owned bounded storage. */
export function readDescriptorBytes(
  descriptor: number,
  buffer: Buffer,
  accountReadBytes?: (bytes: number) => void,
): Buffer {
  let length = 0;
  while (length < buffer.length) {
    const count = readSync(descriptor, buffer, length, buffer.length - length, null);
    if (count === 0) break;
    length += count;
    accountReadBytes?.(count);
  }
  return buffer.subarray(0, length);
}
