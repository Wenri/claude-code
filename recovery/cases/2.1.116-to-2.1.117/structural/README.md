# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) performs an inner-to-inner
comparison of the exact 2.1.116 and 2.1.117 Bun entrypoints
(`cli.inner.js`) and classifies all 4,101,395 target JavaScript tokens and all
20,799 target top-level units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,652 | 3,063,651 |
| Moved structural match | 1,278 | 15,879 |
| Coarse changed candidate | 1,108 | 485,889 |
| Unresolved pairing | 1,761 | 535,976 |
| **Total** | **20,799** | **4,101,395** |

The moved matches comprise 88 uniquely matched units covering 9,140 tokens and
1,190 duplicate-hash candidates covering 6,739 tokens. `unresolved` means the
conservative matcher withheld a baseline pairing, not that target bytes or
tokens are missing. The exact structural fraction is approximately 75.08%, and
the resolved fraction including coarse changed candidates is approximately
86.93%.

The compressed ledger is 2,392,225 bytes with SHA-256
`f778ae437cfcc8f25940c7bd0565e5a0d075fe00ea603e5f54f9db492274f152`.
An independent regeneration from the pinned entrypoints was byte-identical.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.116-to-2.1.117/structural/generated-delta.json.gz \
  --expected-sha256 \
    f778ae437cfcc8f25940c7bd0565e5a0d075fe00ea603e5f54f9db492274f152 \
  --expected-bytes 2392225 \
  --expected-baseline-sha256 \
    d0a9d925342a1b75871d59deb72c9e9d0e8da65880c14ae484867cf456cbe91a \
  --expected-target-sha256 \
    518e12d67eef1cdfd7b5afa0125ae4aec10739ce23dfe62899dac4b62a37d661 \
  --expected-target-tokens 4101395 \
  --expected-target-units 20799
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, original helper spelling, and
erased module boundaries remain unobservable.
