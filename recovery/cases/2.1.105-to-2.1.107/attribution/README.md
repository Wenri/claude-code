# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.107 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact baseline ownership rows;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,664
  target Bun initializer regions; and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 38,092
  exhaustive target partitions.

The 38,091 monotone exact anchors and their between-anchor partitions account
for all 13,612,212 target UTF-16 units, with zero unaccounted units.
[`summary.json`](summary.json) also pins the target package, unchanged
declarations, and the one-bullet official 2.1.107 changelog section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.105-to-2.1.107/attribution \
  --expected-summary-sha256 \
    43a7fca566276b6d89eaa13f47462daa05df8cbb0b11c17a306bd35ff3ceae6f \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844
```
