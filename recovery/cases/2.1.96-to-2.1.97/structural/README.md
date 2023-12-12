# Structural generated-code ledger

[generated-delta.json.gz](generated-delta.json.gz) classifies all 4,257,140
JavaScript tokens and all 18,570 top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 14,120 | 3,271,381 |
| Moved candidate | 1,884 | 136,686 |
| Coarse changed candidate | 1,083 | 376,613 |
| Unresolved pairing | 1,483 | 472,460 |
| **Total** | **18,570** | **4,257,140** |

The ledger contains 17,087 target-to-baseline pairs and accounts for every
target token. `unresolved` means the conservative matcher withheld a 2.1.96
pairing; those tokens are not missing and remain in the exact target bundle,
token ledger, and readable full-bundle diff.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.96-to-2.1.97/structural/generated-delta.json.gz \
  --expected-sha256 \
    76c6de9c8ff81434d1e7a4292fb5f13d402bac993a90f946b8a7ed551c16520c \
  --expected-bytes 2155917 \
  --expected-baseline-sha256 \
    62ad81e3eb00df80ac019b607cd4bad36607f665bffc7b4e9e3db7ade492d66e \
  --expected-target-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988 \
  --expected-target-tokens 4257140 \
  --expected-target-units 18570
```
