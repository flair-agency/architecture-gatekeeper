# Code Review Rules for the synthetic receipt fixture

This directory is an isolated, non-shipping review experiment. Its receipt
protocol is synthetic and does not amend Architecture Gatekeeper's contract.

## Code Review Rules

### Receipt delivery compatibility

- Review `receipt-event.mjs` against `authority-snapshot.md`. That snapshot is
  the adopted protocol for this fixture. The PR proposing a different protocol
  does not adopt it. Read the target/base revision of this guidance and snapshot
  when their proposed copies differ.
- Losing the deployed receiver's entire receipt stream is a P1 defect. Preserve
  the adopted event name, or demonstrate a previously adopted migration that
  keeps the existing receiver working. Do not infer receiver upgrades from a
  proposed snapshot edit. The external receiver is deliberately absent here.

These are semantic review observations only. No native result grants merge
acceptance, and absent findings do not establish successful authority loading.
