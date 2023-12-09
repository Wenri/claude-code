# Generated-code attribution inventory

This inventory uses the verified 2.1.88 source map as the last exact source
ownership oracle and accounts for every UTF-16 code unit in the published
2.1.94 bundle. It does not claim that the unmapped target's authored
TypeScript has been reconstructed.

The three canonical gzip ledgers contain:

- `4,756` exact baseline source-ownership rows;
- `4,584` target Bun initializer regions; and
- `42,859` exhaustive target partitions.

Unique long literals supply `42,858` monotone exact anchors. Together, those
anchors and the between-anchor partitions account for all `13,243,887` target
UTF-16 code units, with zero unaccounted units. `summary.json` also records the
verified 2.1.94 package metadata, declarations, and the 25-bullet section from
the pinned official changelog.

Verify the canonical gzip streams, row counts, artifact identities, and
coverage invariant:

```sh
pixi run node recovery/scripts/verify-attribution-report.mjs \
  --report recovery/cases/2.1.92-to-2.1.94/attribution \
  --expected-summary-sha256 \
    d731b3e8d4f8585944445ebcc7415b486f1fc787efba88f706716d50f010baf6 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564
```
