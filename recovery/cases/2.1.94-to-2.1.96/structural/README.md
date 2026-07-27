# Structural generated-code ledger

`generated-delta.json.gz` classifies all 4,266,673 JavaScript tokens and all
18,564 top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 18,489 | 4,190,103 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 75 | 76,570 |
| **Total** | **18,564** | **4,266,673** |

`unresolved` means the conservative matcher withheld a 2.1.94 pairing. Those
tokens are not missing: they remain in the exact target bundle, token ledger,
and readable full-bundle diff.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.94-to-2.1.96/structural/generated-delta.json.gz \
  --expected-sha256 \
    cc05ee5d259f5c82d115a1b957a0e7d689bbbbc3dbfece3653c4ca9c39a1d3ad \
  --expected-bytes 1889150 \
  --expected-baseline-sha256 \
    11fa0f142edee45aa24ad60b071345847da6c8b2372d338037fe8c4fd4469564 \
  --expected-target-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e \
  --expected-target-tokens 4266673 \
  --expected-target-units 18564
```
