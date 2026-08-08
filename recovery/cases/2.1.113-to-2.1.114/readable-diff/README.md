# Readable full-bundle comparison

These files make the complete normalized 2.1.113 → 2.1.114 Bun-entrypoint
change inspectable through an inner-to-inner `cli.inner.js` comparison while
keeping the non-executable review layer distinct from exact recovery:

- [`normalized.diff.gz`](normalized.diff.gz): paired normalized source text
  in a full Git-style diff, 86,973 bytes, SHA-256
  `f97304d764b0fa2fdce028c6396cdb1f41e20eae841276dc5108f10d19cdd2ba`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  29,716 bytes, SHA-256
  `a1d2b68a0002ae136877467f9699f56e00196295ee0e298eca5700763058bdac`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 72 bytes, SHA-256
  `559213b85395fd41ed7196632b0c152afb73812b365734c4f286c1316f3b5e2a`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,710 bytes, SHA-256
  `16a37c5d9a021b19973a54317acd6b9249be02d866c1f1ae52113ae6d362f8cf`.

The report covers 20,447 baseline and 20,447 target statements. It records
13,982 structurally unique pairs, 26,726 bindings whose generated names were
already equal, zero accepted rename edits, and 224 conservatively rejected
class-name alignments. The comparison-invariant hash remains unchanged
before and after normalization:

```text
3f8737356e768e5e7f53b63b0d36f4f2665a635b9c7c2fac2d4c5293c7bf172a
```

```sh
gzip -cd \
  recovery/cases/2.1.113-to-2.1.114/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.113-to-2.1.114/readable-diff \
  --expected-metadata-sha256 \
    16a37c5d9a021b19973a54317acd6b9249be02d866c1f1ae52113ae6d362f8cf \
  --expected-baseline-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba \
  --expected-target-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16
```

After excluding generated version and build-time substitutions, the paired
text exposes one semantic change: the permission-dialog telemetry effect now
calls `toolUseContext.getAppState` through optional chaining before reading
`toolPermissionContext.mode`. This agrees with the official one-bullet crash
fix while remaining an observation about generated code, not a claim of exact
authored-source spelling.

The normalized representation is solely for review. The executable oracle
remains the raw Bun entrypoint reconstructed by the exact dictionary patch.
