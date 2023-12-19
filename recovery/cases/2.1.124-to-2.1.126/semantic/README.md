# 2.1.126 semantic correspondence

This directory binds the authenticated 2.1.124→2.1.126 generated bundle to the recovered source tree without treating a suite-level ledger as row evidence.

- `direct-evidence.json`: 33 reviewed, row-scoped evidence records (hidden 1, official 32).
- `obligations.json`: one obligation per direct row, all catalog-bound and source-localized.
- `semantic-correspondence.json.gz`: canonical whole-bundle ownership and obligation report.
- `summary.json`: deterministic public summary and identities.

The direct catalog authenticates exact adjacent-bundle fragment counts, exact source fragment hashes/counts, path-scoped fragment removals, and deleted source files against their base identities. Each direct row is consumed exactly once. The catalog identity is itself pinned and loaded by `recovery-2.1.126-direct-evidence.test.mjs`; every other release-scoped focused suite is frozen and consumed by at least one row.

The known-delta proof also pins the exhaustive 6-cluster partition. Every direct cluster maps one-to-one to an authenticated statement witness plus exact source owner/callsite and focused tests, and every direct group maps to one catalog row. Separate reviewed support rows cover 0 prerequisite or residual source paths. The 1 retained Ctrl+L repair path is separately proof-bound without falsely assigning it an adjacent cluster ID. Accounting-only groups are limited to authenticated metadata, exact relocation, dependency, identifier-only, or initializer-linkage evidence.

Closure invariants:

- target tokens: 4,405,944
- accounted tokens: 4,405,944
- unclassified tokens: 0
- official bullets covered: 33/33
- obligations: 33
- unverified obligations: 0
- unresolved application source owners: 0

The report proves semantic reproduction, not recovery of original authored spelling.
