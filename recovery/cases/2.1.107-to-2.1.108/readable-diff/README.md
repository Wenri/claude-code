# Readable full-bundle comparison

These files make the complete minified 2.1.107 → 2.1.108 change inspectable
without treating a normalized representation as executable source:

- [`normalized.diff.gz`](normalized.diff.gz): full normalized Git-style diff,
  5,674,887 bytes, SHA-256
  `bd3ae929d2de00f7fd8755525e3ef808615d7c5a5975d90d605e965e47039d7f`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  282,056 bytes, SHA-256
  `27e01f30a94905949eb41a2170ad0a4a2715f459b16b72ece329cb66778691d9`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 211,964 bytes, SHA-256
  `85be9d3b4ba95bd10448b9e40e017fba17301e604725e59edc13d049ec7e6b12`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,913 bytes, SHA-256
  `1f2ad88dee586fa77289995550e0b976a25dedf0a50f03291b6dd3b3e0bef427`.

The report covers 19,123 baseline and 19,274 target statements. It records
13,131 structurally unique statement pairs, 17,858 accepted bindings, 94,413
identifier edits, and 5,230 rejected unsafe alignments. The
comparison-invariant hash is unchanged before and after every accepted
normalization:

```text
a18dff8c3e895fd98da354aa6c7f4dd9cd30bfc61610ab4d13c22bcd05197cd1
```

```sh
gzip -cd \
  recovery/cases/2.1.107-to-2.1.108/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.107-to-2.1.108/readable-diff \
  --expected-metadata-sha256 \
    1f2ad88dee586fa77289995550e0b976a25dedf0a50f03291b6dd3b3e0bef427 \
  --expected-baseline-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73
```

The normalized target is a non-executable comparison representation. Its
invariant hash proves that the accepted alpha-renames and statement
normalization preserve the comparison fingerprint, not runtime equivalence.
The executable oracle remains the exact bundle reconstructed by the binary
delta, while the 24-path source overlay remains explicitly partial.
