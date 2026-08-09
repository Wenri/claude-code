# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) performs an inner-to-inner
comparison of the exact 2.1.114 and 2.1.116 Bun entrypoints
(`cli.inner.js`) and classifies all 4,093,279 target JavaScript tokens and all
20,734 target top-level units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,864 | 3,308,657 |
| Moved structural match | 1,504 | 15,025 |
| Coarse changed candidate | 392 | 123,224 |
| Unresolved pairing | 1,974 | 646,373 |
| **Total** | **20,734** | **4,093,279** |

The moved matches comprise 50 uniquely matched units covering 7,821 tokens and
1,454 duplicate-hash candidates covering 7,204 tokens. `unresolved` means the
conservative matcher withheld a baseline pairing, not that target bytes or
tokens are missing. The exact structural fraction is approximately 81.20%, and
the resolved fraction including coarse changed candidates is approximately
84.21%.

The compressed ledger is 2,410,825 bytes with SHA-256
`77ae38f5e31dc5ac6eac074f18253d4c67b20fa8a07e00d3caf31519af44fb16`.
An independent regeneration from the pinned entrypoints was byte-identical.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.114-to-2.1.116/structural/generated-delta.json.gz \
  --expected-sha256 \
    77ae38f5e31dc5ac6eac074f18253d4c67b20fa8a07e00d3caf31519af44fb16 \
  --expected-bytes 2410825 \
  --expected-baseline-sha256 \
    cba93e10c9ecc179f51548d8888094a759d6da48824d4dc3d0753af63a912e16 \
  --expected-target-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a \
  --expected-target-tokens 4093279 \
  --expected-target-units 20734
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, original helper spelling, and
erased module boundaries remain unobservable.
