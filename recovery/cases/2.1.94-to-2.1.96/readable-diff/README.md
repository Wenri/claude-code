# Readable full-bundle comparison

These files make the complete minified 2.1.94 → 2.1.96 change inspectable
without treating a normalized representation as executable source:

- `normalized.diff.gz`: full Git-style diff after statement layout and
  conservatively accepted Program-scope alpha renames;
- `statements.diff`: compact statement-type and structural-hash diff;
- `renames.tsv`: every accepted target-to-baseline binding alignment; and
- `metadata.json`: input/output hashes, matching statistics, rejected rename
  reasons, and comparison-invariant checks.

The report records 13,068 structurally unique statement pairs, 3,410 accepted
binding alignments, 7,418 identifier edits, and 2,306 rejected alignments.
The target comparison-invariant hash is unchanged before and after every
accepted normalization.

Inspect the complete diff:

```sh
gzip -cd \
  recovery/cases/2.1.94-to-2.1.96/readable-diff/normalized.diff.gz |
  less
```

Verify the canonical report:

```sh
pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.94-to-2.1.96/readable-diff \
  --expected-metadata-sha256 \
    d3327759c36be49e2aa49212a1f98ee86f39aef04fb291ce32979bc3544c3bb6 \
  --expected-baseline-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564 \
  --expected-target-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e
```

The normalized target is a comparison representation, not the published
program or an authored-TypeScript reconstruction. The executable oracle
remains the exact target bundle recovered by the binary delta.
