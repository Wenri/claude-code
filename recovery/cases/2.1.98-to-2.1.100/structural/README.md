# Structural generated-code ledger

[generated-delta.json.gz](generated-delta.json.gz) classifies all 4,290,969
JavaScript tokens and all 18,747 top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 18,667 | 4,192,305 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 80 | 98,664 |
| **Total** | **18,747** | **4,290,969** |

The ledger contains 18,667 target-to-baseline pairs and accounts for every
target token. `unresolved` means the conservative matcher withheld a 2.1.98
pairing; those tokens are not missing and remain in the exact target bundle,
token ledger, and readable full-bundle diff. The exact structural match
fraction is approximately 97.70%.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.98-to-2.1.100/structural/generated-delta.json.gz \
  --expected-sha256 \
    ed5c1ee6c5d2566af0f0ff06dd8dfe87259cef1777cd64627ae97ae21def5205 \
  --expected-bytes 1908604 \
  --expected-baseline-sha256 \
    27782951b963eaaa7f42018de0732c98c2e855804f709aa700f19cde30f23556 \
  --expected-target-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-tokens 4290969 \
  --expected-target-units 18747
```
