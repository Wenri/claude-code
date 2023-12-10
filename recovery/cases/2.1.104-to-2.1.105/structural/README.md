# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) classifies all 4,354,381
JavaScript tokens and all 19,120 target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 13,477 | 3,229,962 |
| Moved candidate | 2,880 | 386,282 |
| Coarse changed candidate | 621 | 143,168 |
| Unresolved pairing | 2,142 | 594,969 |
| **Total** | **19,120** | **4,354,381** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that bytes are missing. The exact structural fraction is approximately
83.05%; the resolved fraction including conservative moved/changed pairings is
approximately 86.34%.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.104-to-2.1.105/structural/generated-delta.json.gz \
  --expected-sha256 \
    097500c4e061f4dc859da240978d2047abd0ef38966817effbcc5c00df09b68a \
  --expected-bytes 2314608 \
  --expected-baseline-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-tokens 4354381 \
  --expected-target-units 19120
```
