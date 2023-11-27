# Structural generated-code ledger

`generated-delta.json.gz` classifies all `4,222,365` JavaScript tokens and all
`18,329` top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 15,216 | 3,481,458 |
| Moved candidate | 912 | 21,851 |
| Coarse changed candidate | 1,068 | 389,529 |
| Unresolved pairing | 1,133 | 329,527 |
| **Total** | **18,329** | **4,222,365** |

`unresolved` means the conservative matcher did not claim a defensible
2.1.90 pairing. Those tokens are not missing: they remain in the exact target
bundle, token ledger, and readable full-bundle diff.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.90-to-2.1.91/structural/generated-delta.json.gz \
  --expected-sha256 \
    9962b898f24659034aeec2fd8c2f6b3bafe40eaf463f0290e955f3ff3ce7070c \
  --expected-bytes 2054684 \
  --expected-baseline-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9 \
  --expected-target-sha256 \
    b4bf141f30cf8b40196295816c7a6b9d01a36e906908d73a9f9a865ce4cdf816 \
  --expected-target-tokens 4222365 \
  --expected-target-units 18329
```
