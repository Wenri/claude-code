# Structural generated-code ledger

`generated-delta.json.gz` classifies all `4,247,953` JavaScript tokens and all
`18,450` top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 15,318 | 3,667,147 |
| Moved candidate | 1,326 | 12,395 |
| Coarse changed candidate | 406 | 118,809 |
| Unresolved pairing | 1,400 | 449,602 |
| **Total** | **18,450** | **4,247,953** |

`unresolved` means the conservative matcher did not claim a defensible
2.1.91 pairing. Those tokens are not missing: they remain in the exact target
bundle, token ledger, and readable full-bundle diff.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.91-to-2.1.92/structural/generated-delta.json.gz \
  --expected-sha256 \
    7d0d2e0a8e427c88d855ab462ba6a38a979dc2d8d7283e2cd667d975802596bf \
  --expected-bytes 2117355 \
  --expected-baseline-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816 \
  --expected-target-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362 \
  --expected-target-tokens 4247953 \
  --expected-target-units 18450
```
