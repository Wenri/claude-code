# Readable whole-bundle comparison

This directory contains the deterministic, binding-aware comparison between
the authenticated 2.1.112 `cli.js` and the exact 2.1.113 analyzable Bun entry
point.

The comparison covers 19,526 baseline and 20,447 target top-level statements.
It accepts 14,015 binding alignments and 82,266 identifier rewrites while
rejecting 4,846 unsafe alignments. The comparison-invariant hash remains
`d7aa031c11bb709fd05e2f7b4028c4b0cde742b687521d2b0ae40f29b458b4f0`
before renaming, after renaming, and after statement normalization.

Artifacts:

- `normalized.diff.gz` is the complete normalized full-bundle diff;
- `statements.diff` is the compact top-level statement comparison;
- `renames.tsv` records accepted binding renames; and
- `metadata.json` pins every input, output, count, parser setting, and
  verification invariant.

The normalized representation is for review only. Exact recovery uses the
raw embedded-source delta in `../diff/cli.js.zstd-delta`.

