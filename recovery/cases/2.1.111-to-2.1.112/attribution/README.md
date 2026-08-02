# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.112 bundle. It does not project 2.1.88 offsets onto either adjacent bundle
or claim that the target's original TypeScript spelling and module boundaries
were reconstructed.

The canonical gzip ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact source-ownership rows,
  486,257 bytes, SHA-256
  `84ba4e567924d922bd2b6efd795008ab114e3eeae23a1820c7a57319f23268fe`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,684 target
  Bun initializer regions, 113,282 bytes, SHA-256
  `ddd165a69732004fd300ee3a090c05c6dbf18efb3d18aadf1a18617a43c13b96`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 34,366
  exhaustive target partitions, 3,363,491 bytes, SHA-256
  `2f8fe20963f693e5f077d6e38f6bd355c392cfc9fb3742d22e5c2dcb0be38fe7`.

The 34,365 monotone exact anchors and their between-anchor partitions account
for all 13,645,106 target UTF-16 units, with zero unaccounted units.
Initializer evidence resolves 2,413 target regions to one baseline unit and
87 to multiple candidate units; 2,184 remain unresolved because they lack a
unique long literal. Unresolved ownership is reported explicitly.

[`summary.json`](summary.json) is 4,423 bytes with SHA-256
`43ec0e73f45649889a019c7eb4a54163ac41f6570f13ede862c2a363be05d516`.
It pins the target package, unchanged declarations, and the one-bullet
official 2.1.112 changelog section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.111-to-2.1.112/attribution \
  --expected-summary-sha256 \
    43ec0e73f45649889a019c7eb4a54163ac41f6570f13ede862c2a363be05d516 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f
```
