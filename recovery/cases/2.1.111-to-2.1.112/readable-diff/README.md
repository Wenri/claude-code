# Readable full-bundle comparison

These files make the complete minified 2.1.111 → 2.1.112 change inspectable
without treating a normalized representation as executable source:

- [`normalized.diff.gz`](normalized.diff.gz): full normalized Git-style diff,
  5,213,540 bytes, SHA-256
  `604bab69a698eb31d51909525c6f1412abf58e10785ede410b7fda21dc5f3c75`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  30,951 bytes, SHA-256
  `e7061909e0b01d61320fb2d26c2531eb35d172312f0d44ba6bcd0a2554779e62`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 109,999 bytes, SHA-256
  `f2a63c76ff3283c61c0fd364c49d72947aaba4227b70d08dd96cc83c5d49792f`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,788 bytes, SHA-256
  `b73fc10dd74f34868bfa5b0b4ed59a25994ee9eb803b17f8408011399715f99e`.

The report covers 19,525 baseline and 19,526 target statements. It records
13,805 structurally unique pairs, 9,161 accepted bindings, 24,359 identifier
edits, and 9,615 rejected unsafe alignments. The comparison-invariant hash is
unchanged before and after normalization:

```text
2471a6b61446834ad5b795f8bc65ba9d2a6b1f12019757ac6d8acd1527c1fb5b
```

```sh
gzip -cd \
  recovery/cases/2.1.111-to-2.1.112/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.111-to-2.1.112/readable-diff \
  --expected-metadata-sha256 \
    b73fc10dd74f34868bfa5b0b4ed59a25994ee9eb803b17f8408011399715f99e \
  --expected-baseline-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f
```

The normalized diff exposes the added Opus 4.7 capability predicate and its
two temperature guards, alongside generated build provenance and minifier
renaming. The normalized target is a non-executable comparison
representation. The executable oracle remains the exact bundle reconstructed
by the binary delta; the source overlay remains explicitly source-facing.
