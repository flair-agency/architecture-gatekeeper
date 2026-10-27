/** Internal prepared-review data snapshot; never executes supplied accessors. */
import { types } from 'node:util';

export function snapshotPreparedReviewData<T>(value: T): T {
  const visited = new WeakSet();
  const pending: unknown[] = [value];
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
      const descriptor: unknown = Reflect.get(descriptors, key);
      if (typeof key !== 'string' || descriptor === null || typeof descriptor !== 'object' ||
          !Object.hasOwn(descriptor, 'value') ||
          !('value' in descriptor) || !('enumerable' in descriptor) ||
          (!descriptor.enumerable && !(Array.isArray(item) && key === 'length'))) {
        throw new Error('Prepared review materials require non-executable data.');
      }
      pending.push(descriptor.value);
    }
  }
  return structuredClone(value);
}
