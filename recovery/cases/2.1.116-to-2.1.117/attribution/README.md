# Generated-code attribution inventory

This inventory uses the pinned 2.1.88 bundle and matching source map as the
last exact source-ownership oracle. It accounts for every UTF-16 code unit in
the exact 2.1.117 Bun-wrapper interior without treating historical source-map
offsets as target offsets.

The canonical ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact historical
  source-ownership rows, 467,885 bytes, SHA-256
  `c843174ba71691c7a59d3ff020f269bb5357c551319c33aba782c22858876252`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 5,037 target
  Bun initializer regions, 117,150 bytes, SHA-256
  `e83ee8c8e514806176bc92a4ddab8e4f6ef8bdc6366d2e8eeb461d5329d13b15`;
  and
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 30,034
  exhaustive target partitions, 3,023,997 bytes, SHA-256
  `10b3c8e24bf2a8dd7de2aa30c5a773e64209c542620ba2fb3418e7656eeb6f36`.

The 30,033 monotone exact anchors and their between-anchor partitions account
for all 13,114,118 target UTF-16 code units, with zero unaccounted units.
Initializer evidence resolves 2,368 target regions to one historical baseline
unit and 99 to multiple candidate units; 2,570 remain unresolved because they
lack a unique long literal. Three partitions spanning 2,181 code units likewise
remain conservatively unresolved. Every unresolved unit is still present in the
exact target and the exhaustive structural/readable layers.

[`summary.json`](summary.json) is 8,431 bytes with SHA-256
`1c209fa0d7af3706c964a80c7d5dd8b4aff982f165b22f38cd240fb7de04cf51`.
It pins the 2.1.117 package, unchanged declarations, and the 28-bullet official
changelog section from the authenticated upstream changelog snapshot.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.116-to-2.1.117/attribution \
  --expected-summary-sha256 \
    1c209fa0d7af3706c964a80c7d5dd8b4aff982f165b22f38cd240fb7de04cf51 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661
```

An independent clean-directory regeneration produced byte-identical copies of
all four inventory files. No target source map exists: target ownership remains
evidence-ranked, and the report does not claim erased TypeScript names, types,
comments, formatting, or exact authored module boundaries.
