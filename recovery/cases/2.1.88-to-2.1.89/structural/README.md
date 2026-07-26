# Structural generated-code ledger

`generated-delta.json.gz` is a deterministic, path-independent ledger for the
pinned 2.1.88 and 2.1.89 `cli.js` bundles. It partitions the target into
parseable top-level statement units and accounts for every Acorn token.
Comments and whitespace are outside this token universe.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| 2.1.88 `cli.js` | 13,047,043 | `75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f` |
| 2.1.89 `cli.js` | 13,081,065 | `a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01` |
| `generated-delta.json.gz` | 2,096,840 | `4196e4df68330e3f0f84614bb37c4ef98dac056c09cb139e796d41bb34afbbf8` |

## Bounded interpretation

- `matched` means an exact scope-normalized token hash paired inside a longest
  increasing sequence.
- `moved` means the same exact hash paired outside that sequence. Of these,
  242 units have unique hashes and 1,105 have duplicate-hash, therefore
  position-ambiguous, evidence.
- `changed` is a unique unmatched pair found by an
  identifier-insensitive coarse hash. It is a locator candidate, not a claim
  of semantic equivalence.
- `unresolved` means no pair met those rules.

The ledger does not recover author-written TypeScript, comments, erased types,
module boundaries, or names. Nor does it prove complete source recovery.

| Classification | Target units | Target tokens |
| --- | ---: | ---: |
| `matched` | 14,898 | 3,619,974 |
| `moved` | 1,347 | 46,432 |
| `changed` | 480 | 124,936 |
| `unresolved` | 1,456 | 406,460 |
| **Total** | **18,181** | **4,197,802** |

Exact structural matches (`matched` plus `moved`) cover 3,666,406 target
tokens (87.341089%). Including coarse `changed` candidates, the report's
bounded `resolved` count is 3,791,342 tokens (90.317314%). Both bundles have
zero parse-partition failures.

## Reproduce and verify

First acquire the pinned case artifacts as described in
`recovery/README.md`, then run:

```sh
RECOVERY_ARTIFACTS=/tmp/claude-code-recovery-2.1.89

pixi run node recovery/scripts/account-generated-delta.mjs \
  --baseline "$RECOVERY_ARTIFACTS/2.1.88/cli.js" \
  --target "$RECOVERY_ARTIFACTS/2.1.89/package/cli.js" \
  --output /tmp/generated-delta.json.gz

pixi run node recovery/scripts/verify-structural-ledger.mjs \
  --ledger /tmp/generated-delta.json.gz \
  --expected-sha256 \
    4196e4df68330e3f0f84614bb37c4ef98dac056c09cb139e796d41bb34afbbf8 \
  --expected-bytes 2096840 \
  --expected-baseline-sha256 \
    75c9611929d9a770fe2e3a393219d8b98f5de17fde539b2a7355c6db3fd2795f \
  --expected-target-sha256 \
    a9950ef6407fdc750bddb673852485500387e524a99d42385cb81e7d17128e01 \
  --expected-target-tokens 4197802 \
  --expected-target-units 18181
```

The encoder emits pretty-printed JSON with one trailing newline inside gzip
at level 9 and `mtime=0`; source paths are omitted. The verifier checks the
compressed digest and canonical encoding, parses the JSON, recomputes every
classification count, and requires the target token and unit totals to close
exactly. `pixi run npm --prefix recovery test` also pins this artifact and
proves that identical inputs in different directories produce identical
report and gzip bytes.
