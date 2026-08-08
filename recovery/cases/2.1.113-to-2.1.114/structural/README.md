# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) performs an
inner-to-inner comparison of the normalized 2.1.113 and 2.1.114 Bun
entrypoints (`cli.inner.js`) and classifies all 4,051,256 target JavaScript
tokens and all 20,447 target top-level units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 20,375 | 3,978,276 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 72 | 72,980 |
| **Total** | **20,447** | **4,051,256** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that target bytes or tokens are missing. Both the exact structural fraction
and resolved fraction are approximately 98.20%.

The compressed ledger is 2,051,468 bytes with SHA-256
`7c8388ac99c3ae3e777a2e0bc3f84a5c929818d070d071fcf3939ea5072942e8`.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.113-to-2.1.114/structural/generated-delta.json.gz \
  --expected-sha256 \
    7c8388ac99c3ae3e777a2e0bc3f84a5c929818d070d071fcf3939ea5072942e8 \
  --expected-bytes 2051468 \
  --expected-baseline-sha256 \
    4a3c3636c8cb19ef42d6319e5c6ef9b029f5de148b84f22315d159052d6c5eba \
  --expected-target-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16 \
  --expected-target-tokens 4051256 \
  --expected-target-units 20447
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, original helper spelling, and
erased module boundaries remain unobservable.
