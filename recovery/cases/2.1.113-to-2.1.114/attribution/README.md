# Generated-code attribution inventory

This inventory uses the pinned 2.1.88 bundle and matching source map as the
last exact source-ownership oracle. It accounts for every UTF-16 code unit in
the exact 2.1.114 Bun-wrapper interior without treating historical source-map
offsets as target offsets.

The canonical ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact historical
  source-ownership rows, 468,259 bytes, SHA-256
  `b094836b78b6da22c77e98f59f82e9c5afdbe676e6f7d04cc6aa176d33915130`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 4,986 target
  Bun initializer regions, 116,329 bytes, SHA-256
  `549fc7ac3ece40e438abf246442b50c2113984d85dc2cb9041a1378ca75c00f9`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 30,163
  exhaustive target partitions, 3,030,551 bytes, SHA-256
  `d82f3ea643cd11785ef4022b0dc896f992e01cc7bf2f76517a15c76466f26a9d`.

The 30,162 monotone exact anchors and their between-anchor partitions account
for all 12,986,755 target UTF-16 code units, with zero unaccounted units.
Initializer evidence resolves 2,373 target regions to one historical
baseline unit and 100 to multiple candidate units; 2,513 remain unresolved
because they lack a unique long literal. Three partitions spanning 2,181 code
units likewise remain conservatively unresolved. Every unresolved byte is
still present in the exact target and the exhaustive structural/readable
layers.

[`summary.json`](summary.json) is 4,450 bytes with SHA-256
`c998d4735ec13827c11a587d34c80e71ef20d0b613e8116a727f3d3891913f3b`.
It pins the 2.1.114 package, unchanged declarations, and the one-bullet
official changelog section.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.113-to-2.1.114/attribution \
  --expected-summary-sha256 \
    c998d4735ec13827c11a587d34c80e71ef20d0b613e8116a727f3d3891913f3b \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16
```

No target source map exists. Target ownership is evidence-ranked and the
report does not claim erased TypeScript names, types, comments, formatting,
or exact authored module boundaries.
