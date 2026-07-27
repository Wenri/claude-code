# Readable full-bundle comparison

These files make the complete minified 2.1.92 → 2.1.94 change inspectable
without treating a normalized representation as executable source:

- `normalized.diff.gz`: full Git-style diff after statement layout and
  conservatively accepted Program-scope alpha renames;
- `statements.diff`: compact statement-type and structural-hash diff;
- `renames.tsv`: every accepted target-to-baseline binding alignment; and
- `metadata.json`: input/output hashes, matching statistics, rejected rename
  reasons, and comparison-invariant checks.

Inspect the complete diff:

```sh
gzip -cd \
  recovery/cases/2.1.92-to-2.1.94/readable-diff/normalized.diff.gz |
  less
```

Verify its canonical gzip stream, recorded outputs, input identities, and
comparison invariant:

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.92-to-2.1.94/readable-diff \
  --expected-metadata-sha256 \
    d9c2e1f021c58d995046fd29fbb8f72ca3d3542e915e1bb9ba3c01a316700563 \
  --expected-baseline-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362 \
  --expected-target-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564
```

The normalized target is a comparison representation, not the published
program and not an authored-TypeScript reconstruction. The executable oracle
remains the exact target bundle recovered by the case's binary delta.
