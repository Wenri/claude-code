# Structural generated-code ledger

[generated-delta.json.gz](generated-delta.json.gz) classifies all 4,317,783
JavaScript tokens and all 18,911 top-level target units exactly once:

| Classification | Units | Tokens |
| --- | ---: | ---: |
| Matched | 18,832 | 4,238,517 |
| Moved candidate | 0 | 0 |
| Coarse changed candidate | 0 | 0 |
| Unresolved pairing | 79 | 79,266 |
| **Total** | **18,911** | **4,317,783** |

`unresolved` means the conservative matcher withheld a 2.1.101 pairing.
Those tokens are not missing: they remain in the exact target bundle, token
ledger, and full readable diff. The exact structural match fraction is
approximately 98.16%.

```sh
pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger recovery/cases/2.1.101-to-2.1.104/structural/generated-delta.json.gz \
  --expected-sha256 \
    ae8713cb8504c2a48ccc425fefa4856d2b7fb782333a83f29ea8d233f14a6c08 \
  --expected-bytes 1925247 \
  --expected-baseline-sha256 \
    bacffcb4d409504294be4b76273965a646ec412a465bf2dd4c7ed48f6b0309eb \
  --expected-target-sha256 \
    ca80da60be80a380abfe27251d30f5697ae0b60852a5265b50f94d48062a3e39 \
  --expected-target-tokens 4317783 \
  --expected-target-units 18911
```

