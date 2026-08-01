# Readable full-bundle comparison

These files make the complete minified 2.1.109 → 2.1.110 change inspectable
without treating a normalized representation as executable source:

- [`normalized.diff.gz`](normalized.diff.gz): full normalized Git-style diff,
  6,519,710 bytes, SHA-256
  `e31f808c6103312f2db4bcd712a9e73b1b3ad6d9fb3d230fd1b831be25d26194`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  1,324,275 bytes, SHA-256
  `6df904711e8c26b60d0e1e8045965829cfef5ecd709ed325c4b5d0007ac5ab2b`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 213,995 bytes, SHA-256
  `8c05e062f08e8405049232f41b00a14341b4adfac7ff1f6b0ef402de901f97f1`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,876 bytes, SHA-256
  `75ceb96fd85d0fc419da2264feae84495b3dcdb00d1a85260125572931d081e9`.

The report covers 19,277 baseline and 19,458 target statements. It records
13,259 structurally unique pairs, 18,022 accepted bindings, 94,042 identifier
edits, and 5,104 rejected unsafe alignments. The comparison-invariant hash is
unchanged before and after normalization:

```text
80c99e9137802c4f8475b60d2150794c68ff29aaa9c388697d742565aa447210
```

```sh
gzip -cd \
  recovery/cases/2.1.109-to-2.1.110/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.109-to-2.1.110/readable-diff \
  --expected-metadata-sha256 \
    75ceb96fd85d0fc419da2264feae84495b3dcdb00d1a85260125572931d081e9 \
  --expected-baseline-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861
```

The normalized target is a non-executable comparison representation. The
executable oracle remains the exact bundle reconstructed by the binary
delta; the source overlay remains explicitly source-facing.
