# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) classifies all 4,302,774
target JavaScript tokens and all 19,277 target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 19,068 | 4,190,574 |
| Moved candidate | 108 | 1,579 |
| Coarse changed candidate | 8 | 421 |
| Unresolved pairing | 93 | 110,200 |
| **Total** | **19,277** | **4,302,774** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that bytes or tokens are missing. The exact target bundle retains every
region. The exact structural fraction is approximately 97.43%; including
moved and coarse changed candidates, the resolved fraction is approximately
97.44%.

The compressed ledger is 1,967,585 bytes with SHA-256
`59a01d1e0021b02c57ad91e2288659ef1833fed65fa9a19aa201204878ddf7ef`.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.108-to-2.1.109/structural/generated-delta.json.gz \
  --expected-sha256 \
    59a01d1e0021b02c57ad91e2288659ef1833fed65fa9a19aa201204878ddf7ef \
  --expected-bytes 1967585 \
  --expected-baseline-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-sha256 \
    3dc52acca1883b40ede1ca481512036faffbca36f0c5eff9bb4c3c3c99078bb7 \
  --expected-target-tokens 4302774 \
  --expected-target-units 19277
```

This is complete generated-token classification, not exact authored-source
reconstruction. Comments, types, formatting, and erased module boundaries
cannot be recovered from the two source-map-free adjacent packages.
