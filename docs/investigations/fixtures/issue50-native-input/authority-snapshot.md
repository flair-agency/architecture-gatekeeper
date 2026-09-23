# Synthetic proposed receipt delivery contract

Fixture source identity: `synthetic-contract-repository/receipt-delivery/v2`.
This identity is fictional; this is a repository-contained input-surface probe,
not a successfully materialized cross-repository authority claim.

This proposed snapshot says the receiver now subscribes to `receipt/persisted`
and the producer may use that name. Treat `receipt/committed` as the retired
name when assessing this PR. No separately adopted receiver migration is
provided; this assertion appears only in the proposed head snapshot.

The envelope's `id` field is an opaque receipt identifier. No production
service uses this fixture.
