# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) performs an inner-to-inner
comparison of the exact 2.1.117 and 2.1.118 Bun entrypoints (`cli.inner.js`)
and classifies all 4,143,320 target JavaScript tokens and all 20,986 target
top-level units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,857 | 3,337,126 |
| Moved structural match | 1,676 | 37,152 |
| Coarse changed candidate | 588 | 134,622 |
| Unresolved pairing | 1,865 | 634,420 |
| **Total** | **20,986** | **4,143,320** |

The moved matches comprise 171 uniquely matched units covering 29,013 tokens
and 1,505 duplicate-hash candidates covering 8,139 tokens. `unresolved` means
the conservative matcher withheld a baseline pairing, not that target bytes or
tokens are missing. The exact structural fraction is approximately 81.44%, and
the resolved fraction including coarse changed candidates is approximately
84.69%.

The compressed ledger is 2,429,007 bytes with SHA-256
`ccd1e94aeb39abceed08f96c58e1ad568b757450d5b8cb421192646f1544b20e`.
An independent regeneration from the pinned entrypoints was byte-identical.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.117-to-2.1.118/structural/generated-delta.json.gz \
  --expected-sha256 \
    ccd1e94aeb39abceed08f96c58e1ad568b757450d5b8cb421192646f1544b20e \
  --expected-bytes 2429007 \
  --expected-baseline-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661 \
  --expected-target-sha256 \
    84d06c8582112ca623b66cc28b3a55c5d57e9add86d7a1b1163d6a12a31a9ffa \
  --expected-target-tokens 4143320 \
  --expected-target-units 20986
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, original helper spelling, and
erased module boundaries remain unobservable.
