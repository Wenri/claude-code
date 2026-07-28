# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.100 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- [sources.jsonl.gz](sources.jsonl.gz): 4,756 exact baseline
  source-ownership rows;
- [target-initializers.jsonl.gz](target-initializers.jsonl.gz): 4,604 target
  Bun initializer regions; and
- [target-partitions.jsonl.gz](target-partitions.jsonl.gz): 39,997 exhaustive
  target partitions.

The 39,996 monotone exact anchors and their between-anchor partitions account
for all 13,403,094 target UTF-16 code units, with zero unaccounted units.
[summary.json](summary.json) also records the authenticated 2.1.100 package
metadata and byte-identical public declarations.

Verify the canonical streams, row counts, artifact identities, and coverage
invariant:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.98-to-2.1.100/attribution \
  --expected-summary-sha256 \
    1eabfe9cd138c0d67589e05728cfab819d0bdef82d9dca4b4ad9f73b301c9fc4 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be
```
