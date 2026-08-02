# Readable full-bundle comparison

These files make the complete minified 2.1.110 → 2.1.111 change inspectable
without treating a normalized representation as executable source:

- [`normalized.diff.gz`](normalized.diff.gz): full normalized Git-style diff,
  5,574,600 bytes, SHA-256
  `7c45e00a40adeb3a4c5ba3f56948ea01387d3a29ec168578cb7b8b3274d312d5`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  187,029 bytes, SHA-256
  `3d923769045bfd7dc602702b2baedbbcb7ee3b1c22cbb0e440b4268da0b3a8b1`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 221,643 bytes, SHA-256
  `bb0b66b594e1602955dd74595c4177ec3e3ac67d07d65a2df5b10bad5af87882`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,874 bytes, SHA-256
  `9f3e4a43ad665c5594fcac801d46016fc005d4d5572fc48ef56e52dae048707d`.

The report covers 19,458 baseline and 19,525 target statements. It records
13,424 structurally unique pairs, 18,663 accepted bindings, 95,711 identifier
edits, and 4,863 rejected unsafe alignments. The comparison-invariant hash is
unchanged before and after normalization:

```text
8e2852eb809c7ea362bc92143a13c2745baf418255614a38104c60a94c066b5c
```

```sh
gzip -cd \
  recovery/cases/2.1.110-to-2.1.111/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.110-to-2.1.111/readable-diff \
  --expected-metadata-sha256 \
    9f3e4a43ad665c5594fcac801d46016fc005d4d5572fc48ef56e52dae048707d \
  --expected-baseline-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0
```

The normalized target is a non-executable comparison representation. The
executable oracle remains the exact bundle reconstructed by the binary delta;
the source overlay remains explicitly source-facing.
