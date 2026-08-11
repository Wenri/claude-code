# 2.1.120 semantic correspondence

This directory binds the authenticated 2.1.119→2.1.120 generated bundle to the recovered source tree without treating a suite-level ledger as row evidence.

- `direct-evidence.json`: 84 reviewed, row-scoped evidence records (official 22, hidden 15, daemon 3, selection 2, residual 40, fleet 2).
- `obligations.json`: one obligation per direct row, all catalog-bound and source-localized.
- `semantic-correspondence.json.gz`: canonical whole-bundle ownership and obligation report.
- `summary.json`: deterministic public summary and identities.

The direct catalog authenticates exact adjacent-bundle fragment counts, exact source fragment hashes/counts, and path-scoped source removals. Each direct row is consumed exactly once. The catalog identity is itself pinned and loaded by `recovery-2.1.120-direct-evidence.test.mjs`; the remaining frozen suites provide focused behavior boundaries, including official, H01-H15, daemon, selection/scrollback, Fleet, team-memory, Notifications, and subagent-status-line behavior.

Closure invariants:

- target tokens: 4,331,872
- accounted tokens: 4,331,872
- unclassified tokens: 0
- official bullets covered: 22/22
- obligations: 84
- unverified obligations: 0
- unresolved application source owners: 0

The report proves semantic reproduction, not recovery of original authored spelling.
