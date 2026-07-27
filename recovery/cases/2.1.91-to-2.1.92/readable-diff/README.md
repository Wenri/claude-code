# Readable full-bundle comparison

These files make the complete minified 2.1.91 → 2.1.92 change inspectable
without treating a normalized representation as executable source:

- `normalized.diff.gz`: full Git-style diff after statement layout and
  conservatively accepted Program-scope alpha renames;
- `statements.diff`: compact statement-type and structural-hash diff;
- `renames.tsv`: every accepted target-to-baseline binding alignment; and
- `metadata.json`: input/output hashes, matching statistics, rejected rename
  reasons, and comparison-invariant checks.

Inspect the complete diff:

```sh
gzip -cd \
  recovery/cases/2.1.91-to-2.1.92/readable-diff/normalized.diff.gz |
  less
```

The normalized target is a comparison representation, not the published
program and not an authored-TypeScript reconstruction. The executable oracle
remains the exact target bundle recovered by `diff/cli.js.zstd-delta`.
