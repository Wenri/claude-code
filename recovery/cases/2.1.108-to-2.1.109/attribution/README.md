# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.109 bundle. It does not project 2.1.88 offsets onto either adjacent
bundle or claim that the target's original TypeScript spelling and module
boundaries were reconstructed.

The canonical gzip ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact source-ownership rows,
  488,743 bytes, SHA-256
  `d02f5308d7cc27c21d86a591a38d3a25cacc93730a6ffff72bdb7eac9c47e597`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,658 target
  Bun initializer regions, 112,388 bytes, SHA-256
  `0dcafb138c1f5591ec10b14ac38a8ec1515d3d02ebc09823a7937c0024dd2cdf`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 39,005
  exhaustive target partitions, 3,832,033 bytes, SHA-256
  `74ac93b4b5afbfb9f05607031b6f33483abbf0306412caaf93d537fbd101bab3`.

The 39,004 monotone exact anchors and their between-anchor partitions account
for all 13,477,492 target UTF-16 units, with zero unaccounted units.
Initializer evidence resolves 2,448 target regions to one baseline unit and
63 to multiple candidate units; 2,147 remain unresolved because they lack a
unique long literal. Unresolved ownership is reported explicitly.

[`summary.json`](summary.json) is 4,427 bytes with SHA-256
`51e13dafd441140f1cbe712cfeab1548f71274431403d6bc6873601f391f0ea6`.
It pins the target package, unchanged declarations, and the one-bullet
official 2.1.109 changelog section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.108-to-2.1.109/attribution \
  --expected-summary-sha256 \
    51e13dafd441140f1cbe712cfeab1548f71274431403d6bc6873601f391f0ea6 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7
```
