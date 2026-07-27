# Readable full-bundle comparison

These files make the complete minified 2.1.96 → 2.1.97 change inspectable
without treating a normalized representation as executable source:

- [normalized.diff.gz](normalized.diff.gz): full Git-style diff after
  statement layout and conservatively accepted Program-scope alpha renames;
- [statements.diff](statements.diff): compact statement-type and
  structural-hash diff;
- [renames.tsv](renames.tsv): every accepted target-to-baseline binding
  alignment; and
- [metadata.json](metadata.json): input/output hashes, matching statistics,
  rejected rename reasons, and comparison-invariant checks.

The report records 12,549 structurally unique statement pairs, 16,574
accepted binding alignments, 90,396 identifier edits, and 5,494 rejected
alignments. The target comparison-invariant hash is unchanged before and
after every accepted normalization.

Inspect the complete diff:

```sh
gzip -cd \
  recovery/cases/2.1.96-to-2.1.97/readable-diff/normalized.diff.gz |
  less
```

Verify the canonical report:

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.96-to-2.1.97/readable-diff \
  --expected-metadata-sha256 \
    9be5b3065c75bf02e624b6a67b82730b2bbf418906a54acae3893fe3c28ec9f6 \
  --expected-baseline-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e \
  --expected-target-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988
```

The normalized target is a comparison representation, not the published
program or an authored-TypeScript reconstruction. The executable oracle
remains the exact target bundle recovered by the binary delta.
