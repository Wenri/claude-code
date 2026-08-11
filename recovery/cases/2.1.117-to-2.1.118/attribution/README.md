# Generated-code attribution inventory

This inventory uses the pinned 2.1.88 bundle and matching source map as the
last exact source-ownership oracle. It accounts for every UTF-16 code unit in
the exact 2.1.118 Bun-wrapper interior without treating historical source-map
offsets as target offsets.

The canonical ledgers contain:

- [`sources.jsonl.gz`](sources.jsonl.gz): 4,756 exact historical
  source-ownership rows, 466,949 bytes, SHA-256
  `79abad7b0b3cf874000c4f66b8c59a5b3ba53374e799e72eceb112be73a8d21d`;
- [`target-initializers.jsonl.gz`](target-initializers.jsonl.gz): 5,055 target
  Bun initializer regions, 117,410 bytes, SHA-256
  `58cfa9e98f54ea8e5f5bce14a9c01eb94fac6d6b5fbf4de70bf134b7d3e7aa36`;
- [`target-partitions.jsonl.gz`](target-partitions.jsonl.gz): 29,641
  between-anchor target partitions, 2,982,957 bytes, SHA-256
  `03f9d81eb9d08411a9897da5378a25f9174f3d7b38e889adb519113c21ace86e`;
  and
- [`target-ranges.jsonl.gz`](target-ranges.jsonl.gz): an exhaustive interleave
  of all 29,640 exact literal anchors and all 29,641 partitions, 59,281 rows,
  3,489,288 bytes, SHA-256
  `7e07682dc807ef2e8f28ca334b23761ee29e920abad582640d9a81afdf09a15d`.

The 29,640 monotone exact anchors and their between-anchor partitions account
for all 13,234,618 target UTF-16 code units, with zero unaccounted units.
Initializer evidence resolves 2,356 target regions to one historical baseline
unit and 104 to multiple candidate units; 2,595 remain unresolved because they
lack a unique long literal. Three partitions spanning 2,181 code units likewise
remain conservatively unresolved. Every unresolved unit is still present in the
exact target and the exhaustive structural/readable layers.

[`summary.json`](summary.json) is 8,819 bytes with SHA-256
`a10190995c89c30e902c55e0faa94fe5a94f9fa272245d815fa02e1af5f1705c`.
It pins the 2.1.118 package, declarations, and the 34-bullet official changelog
section from the authenticated upstream changelog snapshot.

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.117-to-2.1.118/attribution \
  --expected-summary-sha256 \
    a10190995c89c30e902c55e0faa94fe5a94f9fa272245d815fa02e1af5f1705c \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa
```

An independent clean-directory regeneration produced byte-identical copies of
all five inventory files. No target source map exists: target ownership remains
evidence-ranked, and the report does not claim erased TypeScript names, types,
comments, formatting, or exact authored module boundaries.
