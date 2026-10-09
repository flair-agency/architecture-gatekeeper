/** Invocation-local defensive circuit breaker for Issue334 upstream dispatches. */
const DEFENSIVE_SESSION_DISPATCH_CAP = 10;

/**
 * Each prepared verification receives a fresh counter. The count advances
 * before dispatch, including sends that later fail or whose outcome is unknown.
 */
export function createVertexVerificationReservation(recordReservation = () => true) {
  let count = 0;
  const reserveDispatch = () => {
    if (count >= DEFENSIVE_SESSION_DISPATCH_CAP) return false;
    let recorded = false;
    try { recorded = recordReservation(count + 1) === true; } catch { recorded = false; }
    if (!recorded) return false;
    count++;
    return true;
  };
  return Object.freeze({ reserveDispatch, snapshot: () => Object.freeze({ count, maximum: DEFENSIVE_SESSION_DISPATCH_CAP }) });
}
