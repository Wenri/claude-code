# Readable full-bundle comparison

These files make the complete minified 2.1.104 → 2.1.105 change inspectable
without treating a normalized representation as executable source:

- [`normalized.diff.gz`](normalized.diff.gz): full normalized Git-style diff;
- [`statements.diff`](statements.diff): compact structural statement diff;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments; and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks.

The report records 12,568 structurally unique statement pairs, 16,843
accepted bindings, 85,789 identifier edits, and 5,428 rejected alignments.
The comparison-invariant hash is unchanged before and after every accepted
normalization.

```sh
gzip -cd \
  recovery/cases/2.1.104-to-2.1.105/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.104-to-2.1.105/readable-diff \
  --expected-metadata-sha256 \
    46d02c158b67554758efab2cf57677031359585c641d8b5de2e57171723b5822 \
  --expected-baseline-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75
```

The normalized target is a non-executable comparison representation. The
executable oracle remains the exact bundle reconstructed by the binary delta.
