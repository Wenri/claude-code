# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.98 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- [sources.jsonl.gz](sources.jsonl.gz): 4,756 exact baseline
  source-ownership rows;
- [target-initializers.jsonl.gz](target-initializers.jsonl.gz): 4,604 target
  Bun initializer regions; and
- [target-partitions.jsonl.gz](target-partitions.jsonl.gz): 39,998 exhaustive
  target partitions.

The 39,997 monotone exact anchors and their between-anchor partitions account
for all 13,405,677 target UTF-16 code units, with zero unaccounted units.
[summary.json](summary.json) also records the authenticated 2.1.98 package
metadata, unchanged declarations, and the 57-bullet 2.1.98 section from the
changelog pinned at the official release-tag commit.

Verify the canonical streams, row counts, artifact identities, and coverage
invariant:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.97-to-2.1.98/attribution \
  --expected-summary-sha256 \
    dc013a6e2952141e2a0fd3e99cc5584503dd41699f011bf7a3a798c6b02c967b \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556
```
