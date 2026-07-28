# Readable full-bundle comparison

These files make the complete minified 2.1.101 → 2.1.104 change inspectable
without treating a normalized representation as executable source:

- [normalized.diff.gz](normalized.diff.gz): full Git-style diff after
  statement layout and conservatively accepted Program-scope alpha renames;
- [statements.diff](statements.diff): compact statement-type and
  structural-hash diff;
- [renames.tsv](renames.tsv): accepted target-to-baseline binding
  alignments; and
- [metadata.json](metadata.json): input/output hashes, matching statistics,
  rejected rename reasons, and comparison-invariant checks.

The report records 13,314 structurally unique statement pairs, 9,580
accepted binding alignments, 24,756 identifier edits, and 8,633 rejected
alignments. The target comparison-invariant hash is unchanged before and
after every accepted normalization.

```sh
gzip -cd \
  recovery/cases/2.1.101-to-2.1.104/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.101-to-2.1.104/readable-diff \
  --expected-metadata-sha256 \
    05045ae2af779212ed45de86265869347702a4bc3769339e5c0826bd04e0c479 \
  --expected-baseline-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb \
  --expected-target-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39
```

The normalized target is a non-executable comparison representation. The
executable oracle remains the exact target bundle recovered by the binary
delta.

