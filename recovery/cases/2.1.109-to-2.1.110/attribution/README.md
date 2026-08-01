# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.110 bundle. It does not project 2.1.88 offsets onto either adjacent
bundle or claim that the target's original TypeScript spelling and module
boundaries were reconstructed.

The canonical gzip ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact source-ownership rows,
  486,680 bytes, SHA-256
  `614de1864c4e0434b6abe865eecc20758b84e1caf0ceb00b1ffd47fb7e305755`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,677 target
  Bun initializer regions, 113,153 bytes, SHA-256
  `0623aa4bd7714ac788283d26c36c66ba1bf2e72cfa8e2c8f96f4f3b866a4d5f1`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 34,460
  exhaustive target partitions, 3,362,969 bytes, SHA-256
  `018a10271bfdc12a8abceefbe4f3c0ee6109cae399f3eda846ccfbe2869e88c0`.

The 34,459 monotone exact anchors and their between-anchor partitions account
for all 13,543,815 target UTF-16 units, with zero unaccounted units.
Initializer evidence resolves 2,418 target regions to one baseline unit and
86 to multiple candidate units; 2,173 remain unresolved because they lack a
unique long literal. Unresolved ownership is reported explicitly.

[`summary.json`](summary.json) is 8,337 bytes with SHA-256
`368a5f1288d225956d71fd3d040f3caf80aca542e7d4be06edcd9c47a9829aee`.
It pins the target package, the exact declaration insertion, and the
32-bullet official 2.1.110 changelog section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.109-to-2.1.110/attribution \
  --expected-summary-sha256 \
    368a5f1288d225956d71fd3d040f3caf80aca542e7d4be06edcd9c47a9829aee \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861
```
