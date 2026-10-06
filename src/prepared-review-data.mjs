/** Internal prepared-review data snapshot; never executes supplied accessors. */
import { types } from 'node:util';

export function snapshotPreparedReviewData(value) {
  const visited = new WeakSet();
  const pending = [value];
  while (pending.length) {
    const item = pending.pop();
    if (item === null || ['undefined', 'string', 'number', 'boolean'].includes(typeof item)) continue;
    if (typeof item !== 'object' || types.isProxy(item)) throw new Error('Prepared review materials require non-executable data.');
    if (visited.has(item)) continue;
    visited.add(item);
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== null && prototype !== Object.prototype &&
        !(Array.isArray(item) && prototype === Array.prototype)) {
      throw new Error('Prepared review materials require non-executable data.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(item);
    for (const key of Reflect.ownKeys(descriptors)) {
      const descriptor = descriptors[key];
      if (typeof key !== 'string' || !Object.hasOwn(descriptor, 'value') ||
          (!descriptor.enumerable && !(Array.isArray(item) && key === 'length'))) {
        throw new Error('Prepared review materials require non-executable data.');
      }
      pending.push(descriptor.value);
    }
  }
  return structuredClone(value);
}
