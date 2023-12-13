# Readable full-bundle comparison

These files make the complete normalized 2.1.116 → 2.1.117 Bun-entrypoint
change inspectable through an inner-to-inner `cli.inner.js` comparison while
keeping the non-executable review layer distinct from exact recovery:

- [`normalized.diff.gz`](normalized.diff.gz): paired normalized source text in
  a full Git-style diff, 5,250,956 bytes, SHA-256
  `6e01d04860a55143c73653eabec9c9dab835361a574dfccc29eb8bbb043c970a`;
- [`statements.diff`](statements.diff): compact structural statement diff,
  268,887 bytes, SHA-256
  `2ea8f8d052015192c4a6fc47798fdfce2b5400c3fe543feac6bb376eee05d9af`;
- [`renames.tsv`](renames.tsv): accepted target-to-baseline binding
  alignments, 220,891 bytes, SHA-256
  `9c1dc0a10cc8b1421caa14d9427b63698647d26391c83ace4cb78b36fd974629`;
  and
- [`metadata.json`](metadata.json): hashes, matching statistics, and
  comparison-invariant checks, 3,926 bytes, SHA-256
  `464af12624d44ad2b3c8a260719e395a88728ceef20c352f5fc416fb07401270`.

The report covers 20,734 baseline and 20,799 target statements. It records
13,737 structurally unique pairs and 693 duplicate shared fingerprints. Of
26,344 candidate target bindings, 18,602 were accepted, 192 generated names
were already equal, and 7,550 were conservatively rejected; the accepted
bindings produce 95,980 identifier replacements in the comparison view.

The 23,486,079-byte uncompressed normalized diff has SHA-256
`e2c87198621bb63e1af808ea6d310bac677d5d0b6f83ff4fab23c595ad2ac4c9`.
The comparison-invariant hash remains unchanged before alpha renaming, after
alpha renaming, and after statement normalization:

```text
73de4dfacd8528e8dd4f53af69f9932ff6a752d24be4cb7a697b30722534fe0b
```

```sh
gzip -cd \
  recovery/cases/2.1.116-to-2.1.117/readable-diff/normalized.diff.gz |
  less

pixi run node recovery/scripts/verify-readable-diff.mjs \
  --report recovery/cases/2.1.116-to-2.1.117/readable-diff \
  --expected-metadata-sha256 \
    464af12624d44ad2b3c8a260719e395a88728ceef20c352f5fc416fb07401270 \
  --expected-baseline-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a \
  --expected-target-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661
```

An independent clean-directory regeneration produced byte-identical copies of
all four readable outputs. The normalized representation is solely for review;
the executable oracle remains the raw Bun entrypoint reconstructed by the exact
dictionary patch.
