# Readable full-bundle comparison

These files make the complete minified 2.1.98 → 2.1.100 change inspectable
without treating a normalized representation as executable source:

- [normalized.diff.gz](normalized.diff.gz): full Git-style diff after
  statement layout and conservatively accepted Program-scope alpha renames;
- [statements.diff](statements.diff): compact statement-type and
  structural-hash diff;
- [renames.tsv](renames.tsv): every accepted target-to-baseline binding
  alignment; and
- [metadata.json](metadata.json): input/output hashes, matching statistics,
  rejected rename reasons, and comparison-invariant checks.

The report records 13,178 structurally unique statement pairs, 10,781
accepted binding alignments, 54,294 identifier edits, and 8,968 rejected
alignments. The target comparison-invariant hash is unchanged before and
after every accepted normalization.

Inspect the complete diff:

```sh
gzip -cd \
  recovery/cases/2.1.98-to-2.1.100/readable-diff/normalized.diff.gz |
  less
```

Verify the canonical report:

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.98-to-2.1.100/readable-diff \
  --expected-metadata-sha256 \
    7303decd11d278908a4f03d104926b16f0b5b8eaecf7be1b14ab935d0dd7472e \
  --expected-baseline-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556 \
  --expected-target-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be
```

The normalized target is a non-executable comparison representation, not the
published program or an authored-TypeScript reconstruction. Rejected binding
alignments remain unmodified, and accepted alpha renames do not prove runtime
equivalence where JavaScript observes binding spelling. The executable oracle
remains the exact target bundle recovered by the binary delta.
