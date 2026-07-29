# Structural generated-code ledger

[`generated-delta.json.gz`](generated-delta.json.gz) classifies all 4,302,522
target JavaScript tokens and all 19,274 target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 15,839 | 3,632,808 |
| Moved candidate | 1,542 | 119,438 |
| Coarse changed candidate | 445 | 121,605 |
| Unresolved pairing | 1,448 | 428,671 |
| **Total** | **19,274** | **4,302,522** |

`unresolved` means the conservative matcher withheld a baseline pairing, not
that bytes or tokens are missing. The exact target bundle retains every
region. The exact structural fraction is approximately 87.21%; including
moved and coarse changed candidates, the resolved fraction is approximately
90.04%.

The compressed ledger is 2,202,161 bytes with SHA-256
`bebb1c1c2e0459fa186ef8de92bff9bba5bcfcb474e15f5fa14ed0745f0ffb8e`.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.107-to-2.1.108/structural/generated-delta.json.gz \
  --expected-sha256 \
    bebb1c1c2e0459fa186ef8de92bff9bba5bcfcb474e15f5fa14ed0745f0ffb8e \
  --expected-bytes 2202161 \
  --expected-baseline-sha256 \
    6f6f6b97ede3d13f8e0ed8ab41a84da82b525249d24fa577e98e69d8c0113844 \
  --expected-target-sha256 \
    dc82842f51ef4c3af458c56a2e12efbfce2a3f20f615b19bece30d983d14fe73 \
  --expected-target-tokens 4302522 \
  --expected-target-units 19274
```

This is a complete generated-token classification. It is not an exact
authored-source reconstruction: comments and whitespace are outside token
coverage, and changed or unresolved generated regions do not reveal erased
TypeScript names, types, formatting, or module boundaries.
