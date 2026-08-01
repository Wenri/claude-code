# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) classifies all 4,325,806
target JavaScript tokens and all 19,458 target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 12,734 | 3,090,117 |
| Moved candidate | 4,933 | 587,967 |
| Coarse changed candidate | 612 | 240,424 |
| Unresolved pairing | 1,179 | 407,298 |
| **Total** | **19,458** | **4,325,806** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that bytes or tokens are missing. The exact target bundle retains every
region. The exact structural fraction is approximately 85.03%; including
moved and coarse changed candidates, the resolved fraction is approximately
90.58%.

The compressed ledger is 2,180,866 bytes with SHA-256
`91ee33f66bb3db184f6ef4458e9a67dc33a1c4191e681b78acaaf2ab991bf530`.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.109-to-2.1.110/structural/generated-delta.json.gz \
  --expected-sha256 \
    91ee33f66bb3db184f6ef4458e9a67dc33a1c4191e681b78acaaf2ab991bf530 \
  --expected-bytes 2180866 \
  --expected-baseline-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-sha256 \
    cc686e832fdfb97841608875a918043db5d565a2110821b8fc4cd9fad12ea861 \
  --expected-target-tokens 4325806 \
  --expected-target-units 19458
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, and erased module boundaries
cannot be recovered from the two source-map-free adjacent packages.
