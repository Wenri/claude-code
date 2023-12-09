# Readable full-bundle comparison

These files make the complete minified 2.1.100 → 2.1.101 change inspectable
without treating a normalized representation as executable source:

- [normalized.diff.gz](normalized.diff.gz): full Git-style diff after
  statement layout and conservatively accepted Program-scope alpha renames;
- [statements.diff](statements.diff): compact statement-type and
  structural-hash diff;
- [renames.tsv](renames.tsv): every accepted target-to-baseline binding
  alignment; and
- [metadata.json](metadata.json): input/output hashes, matching statistics,
  rejected rename reasons, and comparison-invariant checks.

The report records 12,689 structurally unique statement pairs, 17,737
accepted binding alignments, 97,322 identifier edits, and 4,673 rejected
alignments. The target comparison-invariant hash is unchanged before and
after every accepted normalization.

Inspect the complete diff:

```sh
gzip -cd \
  recovery/cases/2.1.100-to-2.1.101/readable-diff/normalized.diff.gz |
  less
```

Verify the canonical report:

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.100-to-2.1.101/readable-diff \
  --expected-metadata-sha256 \
    b4fbcbe4b50baede64993a65679fd9f66704f1e596f824d1f922481c88b5fd11 \
  --expected-baseline-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb
```

The normalized target is a non-executable comparison representation, not the
published program or an authored-TypeScript reconstruction. Rejected binding
alignments remain unmodified, and accepted alpha renames do not prove runtime
equivalence where JavaScript observes binding spelling. The executable oracle
remains the exact target bundle recovered by the binary delta.
