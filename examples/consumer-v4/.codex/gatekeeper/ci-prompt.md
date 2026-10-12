Review the proposed change against every selected consumer authority document
in the complete Authority Set. Return PASS when it follows the stated rules,
BLOCK when it conflicts with one, or OWNER_DECISION when the authority leaves
the question open. Report every selected authority ID exactly once and the
provided Authority Set digest. Set ownerDecisionId to the actual nonempty
missing-decision identifier for OWNER_DECISION and to an empty string for PASS
or BLOCK. Do not infer the consumer's architecture from its implementation or
implement changes.
