# Generated-code attribution inventory

This inventory uses the pinned 2.1.88 bundle and matching source map as the
last exact source-ownership oracle. It accounts for every UTF-16 code unit in
the exact 2.1.116 Bun-wrapper interior without treating historical source-map
offsets as target offsets.

The canonical ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact historical
  source-ownership rows, 467,971 bytes, SHA-256
  `ef14f658ac03d68534087be27bed1cc19a5e96827a6cce588bf96b1acdb9b606`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 5,031 target
  Bun initializer regions, 117,072 bytes, SHA-256
  `7390799f0ee126bbf7c68bee1fd58e55f71bd1a06ea52ceee73cc40fbe9195c5`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 30,079
  exhaustive target partitions, 3,029,218 bytes, SHA-256
  `c980bf06163a2f195decca05317f6f022e5663d7d1230351448bffebb96e00f1`.

The 30,078 monotone exact anchors and their between-anchor partitions account
for all 13,102,272 target UTF-16 code units, with zero unaccounted units.
Initializer evidence resolves 2,369 target regions to one historical baseline
unit and 100 to multiple candidate units; 2,562 remain unresolved because they
lack a unique long literal. Three partitions spanning 2,181 code units likewise
remain conservatively unresolved. Every unresolved unit is still present in the
exact target and the exhaustive structural/readable layers.

[`summary.json`](summary.json) is 7,491 bytes with SHA-256
`254f5c3cc09545b7ef46336a626a9d1009f297dbaf4cee55a319c978039883a9`.
It pins the 2.1.116 package, changed declarations, and the 24-bullet official
changelog section from the authenticated upstream changelog snapshot.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.114-to-2.1.116/attribution \
  --expected-summary-sha256 \
    254f5c3cc09545b7ef46336a626a9d1009f297dbaf4cee55a319c978039883a9 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a
```

An independent clean-directory regeneration produced byte-identical copies of
all four inventory files. No target source map exists: target ownership remains
evidence-ranked, and the report does not claim erased TypeScript names, types,
comments, formatting, or exact authored module boundaries.
