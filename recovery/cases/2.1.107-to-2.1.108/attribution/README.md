# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.108 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed, and it does
not project 2.1.88 offsets onto either adjacent bundle.

The canonical gzip ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact baseline ownership rows,
  488,782 bytes, SHA-256
  `3783685aa18edc3a0f8cf77d8b6a8cce902b7d7fed9069843857f98add6062d5`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,657 target
  Bun initializer regions, 112,365 bytes, SHA-256
  `6f272144efd98c8c5b1c6b7134a47c153099339dace1623907c4a5b67e968a8a`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 39,006 exhaustive
  target partitions, 3,830,709 bytes, SHA-256
  `9f1894baf4020c25c641df6c4faa7a77e7777d6032c060a23ba9701a3b453b8f`.

The 39,005 monotone exact anchors and their between-anchor partitions account
for all 13,476,768 target UTF-16 units, with zero unaccounted units.
Initializer evidence resolves 2,448 target regions to one baseline unit and
63 to multiple candidate units; 2,146 remain unresolved because they lack a
unique long literal. Unresolved ownership is reported explicitly rather than
promoted to an unsupported source identity.

[`summary.json`](summary.json) is 7,471 bytes with SHA-256
`22e15b2c4f4862269fd8eed9dad2f7fc958fced3614d5a8bd16e50cd1466533b`.
It also pins the target package, unchanged declarations, and the 24-bullet
official 2.1.108 changelog section. Two notes—`/recap` and current-directory
resume filtering—were already represented in both adjacent bundles; the
partial source overlay consequently localizes 22 release-note behaviors.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.107-to-2.1.108/attribution \
  --expected-summary-sha256 \
    22e15b2c4f4862269fd8eed9dad2f7fc958fced3614d5a8bd16e50cd1466533b \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73
```
