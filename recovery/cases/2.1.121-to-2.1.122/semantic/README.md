# 2.1.122 semantic correspondence

This directory binds the authenticated 2.1.121→2.1.122 generated bundle to the recovered source tree without treating a suite-level ledger as row evidence.

- `direct-evidence.json`: 32 reviewed, row-scoped evidence records (daemon 1, hidden 10, official 18, residual 3).
- `obligations.json`: one obligation per direct row, all catalog-bound and source-localized.
- `semantic-correspondence.json.gz`: canonical whole-bundle ownership and obligation report.
- `summary.json`: deterministic public summary and identities.

The direct catalog authenticates exact adjacent-bundle fragment counts, exact source fragment hashes/counts, path-scoped fragment removals, and deleted source files against their base identities. Each direct row is consumed exactly once. The catalog identity is itself pinned and loaded by `recovery-2.1.122-direct-evidence.test.mjs`; every other release-scoped focused suite is frozen and consumed by at least one row.

Closure invariants:

- target tokens: 4,394,491
- accounted tokens: 4,394,491
- unclassified tokens: 0
- official bullets covered: 18/18
- obligations: 32
- unverified obligations: 0
- unresolved application source owners: 0

The report proves semantic reproduction, not recovery of original authored spelling.
