# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.105 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact baseline ownership rows;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,664
  target Bun initializer regions; and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 38,092
  exhaustive target partitions.

The 38,091 monotone exact anchors and their between-anchor partitions account
for all 13,610,973 target UTF-16 units, with zero unaccounted units.
[`summary.json`](summary.json) also pins the target package, declarations, and
the 37-bullet official 2.1.105 changelog section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.104-to-2.1.105/attribution \
  --expected-summary-sha256 \
    733825c9962b38fbb8e283e080f41008b894c10bee502dc44fe0eae4805fe9bb \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75
```
