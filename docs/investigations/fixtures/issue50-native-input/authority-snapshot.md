# Synthetic adopted receipt delivery contract

Fixture source identity: `synthetic-contract-repository/receipt-delivery/v2`.
This identity is fictional; this is a repository-contained input-surface probe,
not a successfully materialized cross-repository authority claim.

Migration M2 has been adopted by the fixture protocol owner and deployed to the
receipt receiver. The receiver accepts both `receipt/committed` and
`receipt/persisted`; both names deliver the same receipts to its downstream
accounting queue. Producers may emit either name. Migration M2 does not require
dual publishing, because either single event is delivered exactly once.

The envelope's `id` field is an opaque receipt identifier. No production
service uses this fixture.
