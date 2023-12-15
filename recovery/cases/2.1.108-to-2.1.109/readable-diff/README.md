# Readable full-bundle comparison

These files make the complete minified 2.1.108 → 2.1.109 change inspectable
without treating a normalized representation as executable source:

- [`normalized.diff.gz`](normalized.diff.gz): full normalized Git-style diff,
  5,419,575 bytes, SHA-256
  `bbc309756bedee5aa90dd6dbf4666cfece1e1399e8ca772319a29dbe70085eca`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  34,296 bytes, SHA-256
  `8037541d2565391bc5ab1a3b0600a3dfd4f92203118582a9c87f62797980eec9`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 159,119 bytes, SHA-256
  `b258b3d7c71ed51b8597d20dca2b6a068fc735d438768d2d35897bdf0240f3bc`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,838 bytes, SHA-256
  `cfb37331aaa5a6dfabadcb9a59d0fdbd15d287a5922b4573ef7bbc4c3eb31fb7`.

The report covers 19,274 baseline and 19,277 target statements. It records
13,603 structurally unique statement pairs, 13,416 accepted bindings, 68,125
identifier edits, and 9,392 rejected unsafe alignments. The
comparison-invariant hash is unchanged before and after normalization:

```text
21b89cb2dd0576a1c6f4a650c8cef42aad73394b6ed68bdbefce9aca29e5a5fa
```

```sh
gzip -cd \
  recovery/cases/2.1.108-to-2.1.109/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.108-to-2.1.109/readable-diff \
  --expected-metadata-sha256 \
    cfb37331aaa5a6dfabadcb9a59d0fdbd15d287a5922b4573ef7bbc4c3eb31fb7 \
  --expected-baseline-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7
```

The normalized target is a non-executable comparison representation. The
executable oracle remains the exact bundle reconstructed by the binary
delta; the three-path source overlay remains explicitly source-facing.
