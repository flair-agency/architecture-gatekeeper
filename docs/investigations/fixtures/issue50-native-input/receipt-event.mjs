// Non-shipping fixture: returns data and performs no IO.
export function receiptEvent(id) {
  return { event: 'receipt/committed', id };
}
