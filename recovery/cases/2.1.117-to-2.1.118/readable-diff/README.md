# Readable full-bundle comparison

These files make the complete normalized 2.1.117 → 2.1.118 Bun-entrypoint
change inspectable through an inner-to-inner `cli.inner.js` comparison while
keeping the non-executable review layer distinct from exact recovery:

- [`normalized.diff.gz`](normalized.diff.gz): paired normalized source text in
  a full Git-style diff, 5,280,185 bytes, SHA-256
  `feefc20f7eed0b8e5e511eaa8d6c2c3ec5c4585ad2569003d121d55e70a6eada`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  335,634 bytes, SHA-256
  `3a5915f4c58963fbe3b71b1c7a342ecff4338d0feff50182a03326ea341114c9`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 225,326 bytes, SHA-256
  `ff5af886a486b0bd884bd561542164cbad0dfedc37c2f1ecf312bd91ddea6d0b`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,925 bytes, SHA-256
  `f4e5d99b5cf9a5028672701c5d7ce7c43f358cc43bbb0e1cd73a1a2d4ff226b2`.

The report covers 20,799 baseline and 20,986 target statements. It records
13,636 structurally unique pairs and 692 duplicate shared fingerprints. Of
26,124 candidate target bindings, 18,972 were accepted, 58 generated names
were already equal, and 7,094 were conservatively rejected; the accepted
bindings produce 97,890 identifier replacements in the comparison view.

The 23,532,305-byte uncompressed normalized diff has SHA-256
`df440c03406c77da8b85169c8afa67b584ac91553bc11f011d39d89e8e7e7f70`.
The comparison-invariant hash remains unchanged before alpha renaming, after
alpha renaming, and after statement normalization:

```text
45e1e04a9ef0e0bdb543eb0790902cca96be1b6e7d0e3ccd0edbb983b789455c
```

```sh
gzip -cd \
  recovery/cases/2.1.117-to-2.1.118/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.117-to-2.1.118/readable-diff \
  --expected-metadata-sha256 \
    f4e5d99b5cf9a5028672701c5d7ce7c43f358cc43bbb0e1cd73a1a2d4ff226b2 \
  --expected-baseline-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661 \
  --expected-target-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa
```

An independent clean-directory regeneration produced byte-identical copies of
all four readable outputs. The normalized representation is solely for review;
the executable oracle remains the raw Bun entrypoint reconstructed by the exact
dictionary patch.
