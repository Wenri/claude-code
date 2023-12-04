# Structural generated-code ledger

[generated-delta.json.gz](generated-delta.json.gz) classifies all 4,317,367
JavaScript tokens and all 18,910 top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 16,388 | 3,754,276 |
| Moved candidate | 1,167 | 21,923 |
| Coarse changed candidate | 134 | 36,589 |
| Unresolved pairing | 1,221 | 504,579 |
| **Total** | **18,910** | **4,317,367** |

The ledger contains 17,689 target-to-baseline pairs and accounts for every
target token. `unresolved` means the conservative matcher withheld a 2.1.100
pairing; those tokens are not missing and remain in the exact target bundle,
token ledger, and readable full-bundle diff. The exact structural match
fraction is approximately 87.47%.

Verify the canonical gzip and accounting:

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.100-to-2.1.101/structural/generated-delta.json.gz \
  --expected-sha256 \
    d42ac601193aa9ac1f087a812d54f095e97eafe1ce428541db31552d809f9e85 \
  --expected-bytes 2139287 \
  --expected-baseline-sha256 \
    d490cc3e923832683cd899cce6375cb9b3ce734bc72321d0bfea43470d5799be \
  --expected-target-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb \
  --expected-target-tokens 4317367 \
  --expected-target-units 18910
```
