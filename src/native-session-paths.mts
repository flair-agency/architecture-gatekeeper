// @ts-check
// Original host-session boundary adopted by PR #574 at dfdd15d0523a400737e2726312136b8848844497.
// These accessors do not authenticate the host or sanitize arbitrary paths.
/** Return the original CLI request path only for the native commands. */
export function trustedNativeRequestPath() {
  if (!['prepare', 'validate'].includes(process.argv[2])) return undefined;
  return process.argv[3]; // native-request-origin
}
/** During prepare, argv[4] is task text and must never become a trusted path. */
export function trustedNativeDecisionPath() {
  if (process.argv[2] !== 'validate') return undefined;
  return process.argv[4]; // native-decision-origin
}
