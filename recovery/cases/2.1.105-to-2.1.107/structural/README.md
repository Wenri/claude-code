# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) classifies all 4,354,582
JavaScript tokens and all 19,123 target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 19,040 | 4,277,321 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 83 | 77,261 |
| **Total** | **19,123** | **4,354,582** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that bytes are missing. The exact structural and resolved fractions are both
approximately 98.23%.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.105-to-2.1.107/structural/generated-delta.json.gz \
  --expected-sha256 \
    516616ea875c17d81db74f5fbc64ceb5a42e8860be330df48c5ca960c1af3b38 \
  --expected-bytes 1947667 \
  --expected-baseline-sha256 \
    8bc6a637870babb5cb539da24e4bcbbd3e2c399b93d91b319ee42d0f26b03f75 \
  --expected-target-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-tokens 4354582 \
  --expected-target-units 19123
```
