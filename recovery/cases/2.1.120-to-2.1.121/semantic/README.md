# 2.1.121 semantic correspondence

This directory binds the authenticated 2.1.120→2.1.121 generated bundle to the recovered source tree without treating a suite-level ledger as row evidence.

- `direct-evidence.json`: 100 reviewed, row-scoped evidence records (official 39, hidden 13, daemon 3, residual 45).
- `obligations.json`: one obligation per direct row, all catalog-bound and source-localized.
- `semantic-correspondence.json.gz`: canonical whole-bundle ownership and obligation report.
- `summary.json`: deterministic public summary and identities.

The direct catalog authenticates exact adjacent-bundle fragment counts, exact source fragment hashes/counts, and path-scoped source removals. Each direct row is consumed exactly once. Its 33-entry test catalog is fully consumed, and its identity is itself pinned and loaded by `recovery-2.1.121-direct-evidence.test.mjs`. The wider 103-suite release set is separately hash-pinned and executed; its additional 70 suites are regression coverage, not extra row-catalog entries.

Closure invariants:

- target tokens: 4,378,709
- accounted tokens: 4,378,709
- unclassified tokens: 0
- official bullets covered: 39/39
- obligations: 100
- unverified obligations: 0
- unconsumed semantic-core tests: 0
- unresolved application source owners: 0

The report proves semantic reproduction, not recovery of original authored spelling.
