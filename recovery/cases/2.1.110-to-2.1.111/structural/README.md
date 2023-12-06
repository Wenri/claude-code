# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) classifies all 4,335,136
target JavaScript tokens and all 19,525 target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 17,232 | 3,686,452 |
| Moved candidate | 673 | 14,889 |
| Coarse changed candidate | 653 | 275,700 |
| Unresolved pairing | 967 | 358,095 |
| **Total** | **19,525** | **4,335,136** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that bytes or tokens are missing. The exact target bundle retains every
region. The exact structural fraction is approximately 85.38%; including
moved and coarse changed candidates, the resolved fraction is approximately
91.74%.

The compressed ledger is 2,158,979 bytes with SHA-256
`e91269453cebb58e1f1ffc85219672a3e4398f03dc36e228bccb1c6147db334e`.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.110-to-2.1.111/structural/generated-delta.json.gz \
  --expected-sha256 \
    e91269453cebb58e1f1ffc85219672a3e4398f03dc36e228bccb1c6147db334e \
  --expected-bytes 2158979 \
  --expected-baseline-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-sha256 \
    8cd052c0224ebb0f717a0820ff0a8a0616f0de6d2365de43efe9867b8143d0c0 \
  --expected-target-tokens 4335136 \
  --expected-target-units 19525
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, and erased module boundaries
cannot be recovered from the two source-map-free adjacent packages.
