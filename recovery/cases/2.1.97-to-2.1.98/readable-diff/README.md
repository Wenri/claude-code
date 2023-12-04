# Readable full-bundle comparison

These files make the complete minified 2.1.97 → 2.1.98 change inspectable
without treating a normalized representation as executable source:

- [normalized.diff.gz](normalized.diff.gz): full Git-style diff after
  statement layout and conservatively accepted Program-scope alpha renames;
- [statements.diff](statements.diff): compact statement-type and
  structural-hash diff;
- [renames.tsv](renames.tsv): every accepted target-to-baseline binding
  alignment; and
- [metadata.json](metadata.json): input/output hashes, matching statistics,
  rejected rename reasons, and comparison-invariant checks.

The report records 12,790 structurally unique statement pairs, 18,321
accepted binding alignments, 100,559 identifier edits, and 4,353 rejected
alignments. The target comparison-invariant hash is unchanged before and
after every accepted normalization.

Inspect the complete diff:

```sh
gzip -cd \
  recovery/cases/2.1.97-to-2.1.98/readable-diff/normalized.diff.gz |
  less
```

Verify the canonical report:

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.97-to-2.1.98/readable-diff \
  --expected-metadata-sha256 \
    c156cc5e25eac8d41f21b48918a3124753a8c93848e5042f5ea23f60067ca2bb \
  --expected-baseline-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988 \
  --expected-target-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556
```

The normalized target is a comparison representation, not the published
program or an authored-TypeScript reconstruction. The executable oracle
remains the exact target bundle recovered by the binary delta.
