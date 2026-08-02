# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.111 bundle. It does not project 2.1.88 offsets onto either adjacent bundle
or claim that the target's original TypeScript spelling and module boundaries
were reconstructed.

The canonical gzip ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact source-ownership rows,
  486,221 bytes, SHA-256
  `d313e0889cfbbb8dcbfe51db1ca3198048602f6073de3afba50c7d4b59bbf035`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,684 target
  Bun initializer regions, 113,301 bytes, SHA-256
  `ad896e49961c186a86cbc7e7c71b06436cf8b10facef426958a35898ddf3d323`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 34,366
  exhaustive target partitions, 3,362,464 bytes, SHA-256
  `27a32339d1716b0dd58ed6fbe0c5746acfa039f69d090a3d606247305a2d2157`.

The 34,365 monotone exact anchors and their between-anchor partitions account
for all 13,645,027 target UTF-16 units, with zero unaccounted units.
Initializer evidence resolves 2,413 target regions to one baseline unit and
87 to multiple candidate units; 2,184 remain unresolved because they lack a
unique long literal. Unresolved ownership is reported explicitly.

[`summary.json`](summary.json) is 9,285 bytes with SHA-256
`4b89955af3ebcd28c8086d30e7b37424257101a2d73aa974584895fcf08647bf`.
It pins the target package, unchanged declarations, and the 35-bullet official
2.1.111 changelog section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.110-to-2.1.111/attribution \
  --expected-summary-sha256 \
    4b89955af3ebcd28c8086d30e7b37424257101a2d73aa974584895fcf08647bf \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0
```
