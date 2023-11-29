# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.104 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- [sources.jsonl.gz](sources.jsonl.gz): 4,756 exact baseline
  source-ownership rows;
- [target-initializers.jsonl.gz](target-initializers.jsonl.gz): 4,627 target
  Bun initializer regions; and
- [target-partitions.jsonl.gz](target-partitions.jsonl.gz): 39,865 exhaustive
  target partitions.

The 39,864 monotone exact anchors and their between-anchor partitions account
for all 13,501,727 target UTF-16 code units, with zero unaccounted units.
[summary.json](summary.json) also records the authenticated 2.1.104 package
metadata and byte-identical public declarations.

The official changelog is deliberately not an attribution input. The
`v2.1.101` and `v2.1.104` tags share one commit, whose changelog contains a
2.1.101 section but no 2.1.104 section.

Verify the canonical streams, row counts, identities, and coverage invariant:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.101-to-2.1.104/attribution \
  --expected-summary-sha256 \
    2829359772bd3726a6f64fc2960e8161ebf2e308fd50ea9a8f0ae0aaafcd0227 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39
```

