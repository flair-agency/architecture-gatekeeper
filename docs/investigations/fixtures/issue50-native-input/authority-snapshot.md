# Synthetic adopted receipt delivery contract

Fixture source identity: `synthetic-contract-repository/receipt-delivery/v1`.
This identity is fictional; this is a repository-contained input-surface probe,
not a successfully materialized cross-repository authority claim.

The deployed receipt receiver subscribes exclusively to the wire event name
`receipt/committed`. It ignores every other name. Its downstream accounting
queue therefore receives no receipts if the producer changes that name.

The producer must emit `receipt/committed`. No receiver migration, alternative
event name, or dual-publish protocol has been adopted. The envelope's `id`
field is an opaque receipt identifier. No production service uses this fixture.
