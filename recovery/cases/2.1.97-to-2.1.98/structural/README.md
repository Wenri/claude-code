# Structural generated-code ledger

[generated-delta.json.gz](generated-delta.json.gz) classifies all 4,290,788
JavaScript tokens and all 18,748 top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,239 | 3,790,364 |
| Moved candidate | 1,233 | 6,498 |
| Coarse changed candidate | 233 | 68,270 |
| Unresolved pairing | 1,043 | 425,656 |
| **Total** | **18,748** | **4,290,788** |

The ledger contains 17,705 target-to-baseline pairs and accounts for every
target token. `unresolved` means the conservative matcher withheld a 2.1.97
pairing; those tokens are not missing and remain in the exact target bundle,
token ledger, and readable full-bundle diff.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.97-to-2.1.98/structural/generated-delta.json.gz \
  --expected-sha256 \
    fba26dec12b3cfd7da8e0f938060ad070a976a26ddedc0bcb2f9a11972ca53dd \
  --expected-bytes 2081527 \
  --expected-baseline-sha256 \
    4c0b8a21e29799d8755a1bbf83717d7ec9f12779176b768b4d106e705367b988 \
  --expected-target-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556 \
  --expected-target-tokens 4290788 \
  --expected-target-units 18748
```
