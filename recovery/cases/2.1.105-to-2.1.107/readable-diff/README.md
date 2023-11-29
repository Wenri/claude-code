# Readable full-bundle comparison

These files make the complete minified 2.1.105 → 2.1.107 change inspectable
without treating a normalized representation as executable source:

- [`normalized.diff.gz`](normalized.diff.gz): full normalized Git-style diff;
- [`statements.diff`](statements.diff): compact structural statement diff;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments; and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks.

The report records 13,474 structurally unique statement pairs, 8,102 accepted
bindings, 24,383 identifier edits, and 6,634 rejected alignments. The
comparison-invariant hash is unchanged before and after every accepted
normalization.

```sh
gzip -cd \
  recovery/cases/2.1.105-to-2.1.107/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.105-to-2.1.107/readable-diff \
  --expected-metadata-sha256 \
    af3a3b14069a792bd4f4275c1e9c572e41036a8d193349b632d31da06b186b88 \
  --expected-baseline-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844
```

The normalized target is a non-executable comparison representation. The
executable oracle remains the exact bundle reconstructed by the binary delta.
