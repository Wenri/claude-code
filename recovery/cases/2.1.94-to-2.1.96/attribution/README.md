# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.96 bundle. It does not claim that the unmapped target's original
TypeScript spelling or module boundaries have been reconstructed.

The canonical gzip ledgers contain:

- 4,756 exact baseline source-ownership rows;
- 4,584 target Bun initializer regions; and
- 42,859 exhaustive target partitions.

The exact anchors and between-anchor partitions account for all 13,244,035
target UTF-16 code units, with zero unaccounted units. `summary.json` also
records the verified 2.1.96 package metadata, unchanged declarations, and the
one-entry 2.1.96 section from the changelog pinned at the official release-tag
commit.

Verify the canonical streams, row counts, artifacts, and coverage invariant:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.94-to-2.1.96/attribution \
  --expected-summary-sha256 \
    f5d0f9c984c9a7e584626b33b5d4622f8bd3a1f92239c3ab972588c6e3c799c6 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e
```
