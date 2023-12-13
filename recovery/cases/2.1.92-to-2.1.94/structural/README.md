# Structural generated-code ledger

`generated-delta.json.gz` classifies all `4,266,602` JavaScript tokens and all
`18,563` top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,768 | 3,879,475 |
| Moved candidate | 814 | 14,854 |
| Coarse changed candidate | 154 | 59,881 |
| Unresolved pairing | 827 | 312,392 |
| **Total** | **18,563** | **4,266,602** |

`unresolved` means the conservative matcher did not claim a defensible
2.1.92 pairing. Those tokens are not missing: they remain in the exact target
bundle, token ledger, and readable full-bundle diff.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.92-to-2.1.94/structural/generated-delta.json.gz \
  --expected-sha256 \
    08158a2006076e86e5cd82699ea627279da6260da002dd6cbc2d3baa371046b5 \
  --expected-bytes 2028409 \
  --expected-baseline-sha256 \
    6b0b860206b3723d70619b84dbf3a53a795d703862aa3b01d58e869685c85362 \
  --expected-target-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564 \
  --expected-target-tokens 4266602 \
  --expected-target-units 18563
```
