# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) classifies all 4,335,166
target JavaScript tokens and all 19,526 target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 19,451 | 4,252,777 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 75 | 82,389 |
| **Total** | **19,526** | **4,335,166** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that bytes or tokens are missing. The exact target bundle retains every
region. Both the exact structural fraction and resolved fraction are
approximately 98.10%.

The compressed ledger is 1,987,262 bytes with SHA-256
`545900350eed707098a25d1221e66021ee89c0cda04acdf2e33bc01a53c8e277`.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.111-to-2.1.112/structural/generated-delta.json.gz \
  --expected-sha256 \
    545900350eed707098a25d1221e66021ee89c0cda04acdf2e33bc01a53c8e277 \
  --expected-bytes 1987262 \
  --expected-baseline-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-sha256 \
    bc3358282800e3e99daa8e71ac5b7b1566bd0d7ca7eb94f714a7859365d3163f \
  --expected-target-tokens 4335166 \
  --expected-target-units 19526
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, original helper spelling, and
erased module boundaries cannot be recovered from the two source-map-free
adjacent packages.
