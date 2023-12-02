# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.97 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- [sources.jsonl.gz](sources.jsonl.gz): 4,756 exact baseline
  source-ownership rows;
- [target-initializers.jsonl.gz](target-initializers.jsonl.gz): 4,576 target
  Bun initializer regions; and
- [target-partitions.jsonl.gz](target-partitions.jsonl.gz): 40,110 exhaustive
  target partitions.

The 40,109 monotone exact anchors and their between-anchor partitions account
for all 13,310,031 target UTF-16 code units, with zero unaccounted units.
[summary.json](summary.json) also records the authenticated 2.1.97 package
metadata, changed declarations, and the 46-bullet 2.1.97 section from the
changelog pinned at the official release-tag commit.

Verify the canonical streams, row counts, artifact identities, and coverage
invariant:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.96-to-2.1.97/attribution \
  --expected-summary-sha256 \
    da16ca8586440364f11247f290577f1778c16dcbb327b0ece060880c82aa31c1 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988
```
