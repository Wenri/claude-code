# Structural generated-code ledger

`generated-delta.json.gz` classifies all `4,213,780` JavaScript tokens and all
`18,275` top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,166 | 3,714,350 |
| Moved candidate | 976 | 14,844 |
| Coarse changed candidate | 320 | 179,767 |
| Unresolved pairing | 813 | 304,819 |
| **Total** | **18,275** | **4,213,780** |

`unresolved` means the conservative matcher did not claim a defensible
2.1.89 pairing. Those tokens are not missing: they remain present in the
exact target bundle, the token ledger, and the readable full-bundle diff.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.89-to-2.1.90/structural/generated-delta.json.gz \
  --expected-sha256 \
    7cd29e61b5ca2bb8209a990c1d7702cc6c42b9810a11815c117309cf55cf84a2 \
  --expected-bytes 1998098 \
  --expected-baseline-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01 \
  --expected-target-sha256 \
    069185909d50518b8b239acc0f9ae9b062a610595299b35955fc53e6e2c2f5e9 \
  --expected-target-tokens 4213780 \
  --expected-target-units 18275
```
