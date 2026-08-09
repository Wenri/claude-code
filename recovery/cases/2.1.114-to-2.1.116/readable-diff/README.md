# Readable full-bundle comparison

These files make the complete normalized 2.1.114 → 2.1.116 Bun-entrypoint
change inspectable through an inner-to-inner `cli.inner.js` comparison while
keeping the non-executable review layer distinct from exact recovery:

- [`normalized.diff.gz`](normalized.diff.gz): paired normalized source text in
  a full Git-style diff, 5,426,166 bytes, SHA-256
  `66c0422b17155d5d7a1ac6e71b3019eda6c059487268ffd41edd78f31a63f1ea`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  338,201 bytes, SHA-256
  `5612033c8d3b639cb360543d75895f949ea1fa39edd48df2dc9e2b93385a70c3`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 223,105 bytes, SHA-256
  `b33e0b1fe0e12e604a9d93aba748fcfc5d483016318b3c51e460ca6ea346161c`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,927 bytes, SHA-256
  `91c3964bcfc1f21a5ba717f4361f321d33c74017f02e5803e445e4819ec91890`.

The report covers 20,447 baseline and 20,734 target statements. It records
13,339 structurally unique pairs and 691 duplicate shared fingerprints. Of
25,559 candidate target bindings, 18,787 were accepted, 52 generated names were
already equal, and 6,720 were conservatively rejected; the accepted bindings
produce 104,735 identifier replacements in the comparison view.

The 23,967,172-byte uncompressed normalized diff has SHA-256
`24e915b3221620c1981075279efae995ac883da181cf1b0abc1712744d33e24d`.
The comparison-invariant hash remains unchanged before alpha renaming, after
alpha renaming, and after statement normalization:

```text
20753ff833bf02449cb20e00f4c0ad8c688bfbd5746cd6e78faac8ff4987ba61
```

```sh
gzip -cd \
  recovery/cases/2.1.114-to-2.1.116/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.114-to-2.1.116/readable-diff \
  --expected-metadata-sha256 \
    91c3964bcfc1f21a5ba717f4361f321d33c74017f02e5803e445e4819ec91890 \
  --expected-baseline-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16 \
  --expected-target-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a
```

An independent clean-directory regeneration produced byte-identical copies of
all four readable outputs. The normalized representation is solely for review;
the executable oracle remains the raw Bun entrypoint reconstructed by the exact
dictionary patch.
