# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.101 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- [sources.jsonl.gz](sources.jsonl.gz): 4,756 exact baseline
  source-ownership rows;
- [target-initializers.jsonl.gz](target-initializers.jsonl.gz): 4,627 target
  Bun initializer regions; and
- [target-partitions.jsonl.gz](target-partitions.jsonl.gz): 39,867 exhaustive
  target partitions.

The 39,866 monotone exact anchors and their between-anchor partitions account
for all 13,500,405 target UTF-16 code units, with zero unaccounted units.
[summary.json](summary.json) also records the authenticated 2.1.101 package
metadata and byte-identical public declarations.

Verify the canonical streams, row counts, artifact identities, and coverage
invariant:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.100-to-2.1.101/attribution \
  --expected-summary-sha256 \
    875e8ec5b1fe9c8c5358dd03030a0c9394ea63bd1ba699d105051577066ef9c4 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb
```
